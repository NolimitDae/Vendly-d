import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { withBookingLock, withJobLock } from 'src/common/helper/job-lock';
import * as Sentry from '@sentry/nestjs';
import { AddOnKind, BookingExtraStatus, BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { Prisma } from 'prisma/generated/client';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { currentFees } from 'src/modules/platform/platform-settings.service';
import { isLargeBooking } from 'src/modules/platform/fee-config';
import { AUTO_RELEASE_DAYS, buildSchedule, MAX_ATTEMPTS, PROOF_RELEASE_HOURS, RETRY_INTERVAL_MS, securityHoldAt } from './payment-schedule';
import { track } from 'src/common/analytics';
import { vendorEarnings } from './vendor-earnings';
import { bookingTitle, cardText, money, shortDate } from './money-text';
import { autoRetryAt, deadlineText, dueInstallment, dueKindFor, paymentDueBy, PaymentDueKind, paymentDueRules, paymentState } from './payment-due';
import { BANK, BANK_CLEARING_TEXT, bankNotAllowedReason, bankText, isBank, isClearing, paymentMethodType } from './bank-payments';
import { customRows, firstCharge, isPaidCharge } from './custom-plan';
import { checkDisputePhotos, describeDisputeAsk, disputePhotoUrls, removeDisputePhotos, storeDisputePhotos } from './dispute-files';
import { requestPhotoUrls } from 'src/modules/booking/request-photos';
import { NOT_STARTED_FLAG_HOURS, notStartedWindow, pastStartNotStarted } from 'src/modules/booking/no-show';
import { isBankPaymentsOff, isStripeMissing } from 'src/common/lib/Payment/stripe/stripe-errors';

/** A customer's report: the reason, and from newer apps what kind of problem and what they ask for. */
export interface DisputeInput {
  reason: string;
  category?: string | null;
  outcome?: string | null;
  requested_amount?: number | null;
}

const HOUR = 3600 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Stripe's smallest card charge in USD. */
const MIN_CHARGE = 0.5;
const DAY = 24 * HOUR;
const SECURITY_DEPOSIT = 'security_deposit';
/** Early release is refused while the vendor owes Vendly money from an earlier refund. */
export const EARLY_RELEASE_OWING = 'Your Vendly balance is below zero from an earlier refund. It’s settled from your next payout; you can take deposits early again after that.';

/** What of an installment is the vendor's: its amount less the Vendly Protection fee and refunds. */
export const vendorPortion = (i: { amount: unknown; fee_amount: unknown; refunded_amount: unknown }) =>
  round2(Math.max(0, Number(i.amount) - Number(i.fee_amount) - Number(i.refunded_amount)));

const isPaid = (i: { status: InstallmentStatus }) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED;

/** Why a give-back is capped below what the customer paid. */
export const GIVE_BACK_PAID_OUT = 'The rest has already been paid out to you, so it can be given back once your Vendly balance covers it. Contact Vendly support if the customer needs it sooner.';

export interface RefundPart {
  installment_id: string;
  amount: number;
  /** the vendor had already been paid this installment's share */
  paid_out: boolean;
}

/** Stripe statuses a saved-card charge can land in that still need the customer. */
const NEEDS_CUSTOMER = new Set(['requires_action', 'requires_payment_method', 'requires_confirmation']);

/** What recordFailure reads from the booking of a failed charge. */
interface FailureBooking {
  id: string;
  customer_id: string;
  vendor_id?: string;
  /** the pending-payment window (and its cancellation) is only for a booking still to happen */
  status?: BookingStatus | string;
  payment_plan?: PaymentPlan | null;
  deposit_rules?: boolean | null;
  payment_due_by?: Date | null;
  /** price and fee: a large booking gets 48 hours to pay instead of 12 */
  amount?: unknown;
  service_fee?: unknown;
  /** "us_bank_account" when the booking pays from a bank account */
  payment_method_type?: string | null;
  listing: { title: string } | null;
  customer: { email: string | null; name: string | null };
  vendor?: { email: string | null; name: string | null } | null;
}

/** What paidSoFar and checkoutPart read from a booking. */
interface CheckoutBooking {
  amount?: unknown;
  service_fee?: unknown;
  paid_at?: Date | null;
  payment_transaction_id?: string | null;
  installments?: { kind: string; status: InstallmentStatus; amount: unknown; fee_amount: unknown; refunded_amount: unknown }[];
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private push: PushService,
  ) {}

  // ─── Saved cards ───────────────────────────────────────────────────────────

  /** Stripe customer id for a user, created on first use. */
  private async customerIdFor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, billing_id: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.billing_id) {
      // a stale profile (deleted in Stripe, or from other Stripe keys) is replaced with a new one
      const live = await StripePayment.getCustomerByID(user.billing_id).then(
        (c) => !(c as unknown as { deleted?: boolean }).deleted,
        (err) => {
          if (isStripeMissing(err)) return false;
          throw err;
        },
      );
      if (live) return user.billing_id;
    }
    const customer = await StripePayment.createCustomer({ user_id: user.id, email: user.email ?? '', name: user.name ?? '' });
    if (!customer?.id) throw new BadRequestException('Could not create a billing profile');
    await this.prisma.user.update({ where: { id: userId }, data: { billing_id: customer.id } });
    return customer.id;
  }

  /**
   * Client secret for Stripe's card form, or with `type` us_bank_account for connecting a bank account
   * (large bookings: instant verification through Stripe Financial Connections, and the mandate the
   * customer accepts when confirming lets Vendly charge it later).
   */
  async createSetupIntent(userId: string, type?: string) {
    const customerId = await this.customerIdFor(userId);
    if (!isBank(type)) {
      const intent = await StripePayment.createSetupIntent(customerId);
      return { success: true, data: { client_secret: intent.client_secret, customer_id: customerId } };
    }
    try {
      const intent = await StripePayment.createBankSetupIntent(customerId);
      return { success: true, data: { client_secret: intent.client_secret, customer_id: customerId, type: BANK } };
    } catch (err) {
      if (!isBankPaymentsOff(err)) throw err;
      // ACH Direct Debit isn't switched on in the Stripe dashboard: Vendly needs to know, the customer needs a way on
      this.logger.error('Bank payments are not enabled on the Stripe account (Settings → Payment methods → ACH Direct Debit)');
      Sentry.captureMessage('Bank payments (ACH Direct Debit) are not enabled on the Stripe account', { level: 'error', tags: { job: 'bank-setup' } });
      throw new BadRequestException('Bank payments aren’t available yet. Please use a card for now.');
    }
  }

  /** Saved cards; with `withBank`, saved bank accounts too (apps that can show them ask for them). */
  async listCards(userId: string, withBank = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { billing_id: true } });
    if (!user?.billing_id) return { success: true, data: [] };
    let cards: Awaited<ReturnType<typeof StripePayment.listCards>>;
    let customer: Awaited<ReturnType<typeof StripePayment.getCustomerByID>>;
    try {
      [cards, customer] = await Promise.all([StripePayment.listCards(user.billing_id), StripePayment.getCustomerByID(user.billing_id)]);
    } catch (err) {
      if (!isStripeMissing(err)) throw err;
      // a stale profile has no cards here; it's replaced when the next card is added
      return { success: true, data: [] };
    }
    const defaultId = (customer as any)?.invoice_settings?.default_payment_method ?? null;
    // bank payments may be switched off in Stripe: the cards still show
    const banks = withBank ? await StripePayment.listBankAccounts(user.billing_id).catch(() => []) : [];
    return {
      success: true,
      data: [
        ...cards.map((c) => ({
          id: c.id,
          type: 'card',
          brand: c.card?.brand,
          last4: c.card?.last4,
          exp_month: c.card?.exp_month,
          exp_year: c.card?.exp_year,
          is_default: c.id === defaultId,
        })),
        ...banks.map((b) => ({
          id: b.id,
          type: BANK,
          bank_name: b.us_bank_account?.bank_name ?? null,
          last4: b.us_bank_account?.last4,
          account_type: b.us_bank_account?.account_type ?? null,
          is_default: b.id === defaultId,
        })),
      ],
    };
  }

  /** Confirms a payment method belongs to this user before it is used or removed. */
  async assertOwnsCard(userId: string, paymentMethodId: string) {
    return (await this.ownedPaymentMethod(userId, paymentMethodId)).customerId;
  }

  /**
   * The user's payment method, checked for what it pays: a card always; a bank account only where
   * `bankFor` allows one (a large booking without a card hold, bank-payments.ts). Null `bankFor`
   * means cards only (rentals). 403 when it isn't theirs, 400 with the reason when a bank can't pay.
   */
  async assertPaymentMethod(userId: string, paymentMethodId: string, bankFor: { total: number; plan?: PaymentPlan | string | null; securityDeposit?: unknown } | null) {
    const owned = await this.ownedPaymentMethod(userId, paymentMethodId);
    if (isBank(owned.type)) {
      const why = bankFor ? bankNotAllowedReason(bankFor) : 'This needs a card. Please choose a card.';
      if (why) throw new BadRequestException(why);
    }
    return owned;
  }

  /** The user's saved payment method and its kind ("card", "us_bank_account"); 403 when it isn't theirs. */
  async ownedPaymentMethod(userId: string, paymentMethodId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { billing_id: true } });
    const pm = await StripePayment.retrievePaymentMethod(paymentMethodId).catch(() => null);
    const owner = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
    if (!pm || !user?.billing_id || owner !== user.billing_id) throw new ForbiddenException('That card is not on your account');
    return { customerId: user.billing_id, type: (pm as { type?: string }).type ?? 'card' };
  }

  async setDefaultCard(userId: string, paymentMethodId: string) {
    const customerId = await this.assertOwnsCard(userId, paymentMethodId);
    await StripePayment.setCustomerDefaultPaymentMethodId({ customer_id: customerId, payment_method_id: paymentMethodId });
    return { success: true };
  }

  async removeCard(userId: string, paymentMethodId: string) {
    await this.assertOwnsCard(userId, paymentMethodId);
    const inUse = await this.prisma.booking.count({
      where: { customer_id: userId, payment_method_id: paymentMethodId, status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] } },
    });
    if (inUse > 0) throw new BadRequestException('This card is used by an active booking. Change that booking’s card first.');
    await StripePayment.detachPaymentMethod(paymentMethodId);
    return { success: true };
  }

  // ─── Schedule + charging ───────────────────────────────────────────────────

  /** Which plan a listing uses: its own, else its category default, else full on accept. */
  async planForListing(listingId: string | null | undefined): Promise<PaymentPlan> {
    if (!listingId) return PaymentPlan.FULL_ON_ACCEPT;
    const l = await this.prisma.vendorListing.findUnique({
      where: { id: listingId },
      select: { payment_plan: true, category: { select: { default_payment_plan: true } } },
    });
    return l?.payment_plan ?? l?.category?.default_payment_plan ?? PaymentPlan.FULL_ON_ACCEPT;
  }

  /**
   * Called when the vendor accepts. Snapshots the plan into installments and charges whatever is
   * due now. Charge failures never block the acceptance; they go through the retry schedule.
   */
  async scheduleForBooking(bookingId: string, acceptedAt = new Date()) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, amount: true, service_fee: true, security_deposit: true, currency: true, event_start_at: true, scheduled_at: true, payment_plan: true, custom_payment_plan: true, listing_id: true, paid_at: true, installments: { select: { id: true } } },
    });
    if (!booking || booking.installments.length > 0 || booking.paid_at) return [];
    let plan = booking.payment_plan ?? (await this.planForListing(booking.listing_id));
    // a custom plan agreed on the request (custom-plan.ts); if the price moved since, the package's own plan applies
    const custom = plan === PaymentPlan.CUSTOM ? customRows(booking.custom_payment_plan, Number(booking.amount ?? 0) + Number(booking.service_fee ?? 0), acceptedAt) : null;
    if (plan === PaymentPlan.CUSTOM && !custom) {
      this.logger.warn(`Custom payment plan of ${bookingId} no longer matches its total; using the package's plan`);
      plan = await this.planForListing(booking.listing_id);
    }
    const planned = custom ?? buildSchedule({
      plan,
      price: Number(booking.amount ?? 0),
      serviceFee: Number(booking.service_fee ?? 0),
      eventStart: booking.event_start_at ?? booking.scheduled_at,
      acceptedAt,
    });
    if (planned.length === 0 || planned.every((p) => p.amount <= 0)) return [];
    const rows_: { sequence: number; label: string; amount: number; fee_amount: number; due_at: Date; capture_manually: boolean; kind?: string }[] = [...planned];
    const deposit = Number(booking.security_deposit ?? 0);
    if (deposit > 0) {
      // rentals: authorized shortly before pickup (card holds lapse after about 7 days), never captured unless the vendor reports fees
      const start = booking.event_start_at ?? booking.scheduled_at;
      const holdAt = securityHoldAt(start, acceptedAt);
      rows_.push({ sequence: planned.length + 1, label: 'Security deposit (refundable hold)', amount: deposit, fee_amount: 0, due_at: holdAt, capture_manually: true, kind: SECURITY_DEPOSIT });
    }

    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { payment_plan: plan, ...(plan !== PaymentPlan.CUSTOM && booking.custom_payment_plan ? { custom_payment_plan: Prisma.DbNull } : {}) } });
      return Promise.all(
        rows_.map((p) =>
          tx.bookingInstallment.create({
            data: { booking_id: bookingId, sequence: p.sequence, label: p.label, amount: p.amount, fee_amount: p.fee_amount, currency: booking.currency ?? 'usd', due_at: p.due_at, capture_manually: p.capture_manually, kind: p.kind ?? 'charge' },
          }),
        ),
      );
    });
    for (const r of rows) if (r.due_at <= acceptedAt) await this.chargeInstallment(r.id).catch((e) => this.logger.error(`charge ${r.id}`, e));
    return rows;
  }

  /** One attempt at charging an installment on the booking's saved card. Safe to call repeatedly. */
  async chargeInstallment(installmentId: string, paymentMethodOverride?: string) {
    const inst = await this.prisma.bookingInstallment.findUnique({
      where: { id: installmentId },
      include: {
        booking: {
          select: {
            id: true, customer_id: true, vendor_id: true, payment_method_id: true, payment_method_type: true, status: true, payment_plan: true, deposit_rules: true, payment_due_by: true, amount: true, service_fee: true,
            listing: { select: { title: true } }, customer: { select: { email: true, name: true, billing_id: true } }, vendor: { select: { email: true, name: true } },
          },
        },
      },
    });
    if (!inst) return null;
    if (inst.status !== InstallmentStatus.SCHEDULED) return inst;
    const b = inst.booking;
    if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED) {
      return this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.CANCELLED } });
    }
    const paymentMethod = paymentMethodOverride ?? b.payment_method_id;
    if (!paymentMethod || !b.customer.billing_id) {
      // counts as an attempt and waits for the customer: retrying without a card can't work, and an
      // unchanged row would be picked up (and emailed about) again by every run of the sweep
      return this.recordFailure(inst.id, inst.attempts + 1, 'No saved card on this booking', b, inst, undefined, true);
    }
    // a pay-after-service charge whose job is already complete is taken straight away: a hold placed
    // now would never be captured (completion captures the holds there are at that moment)
    const captureManually = inst.capture_manually && !(inst.kind !== SECURITY_DEPOSIT && b.status === BookingStatus.COMPLETED);
    // a bank account (large bookings): the booking's own method is known; another one picked for this charge is looked up
    const bank = paymentMethodOverride && paymentMethodOverride !== b.payment_method_id ? isBank(await paymentMethodType(paymentMethodOverride)) : isBank(b.payment_method_type);
    if (bank && captureManually) {
      // a bank payment can't be held and charged later; the booking flow never offers one for these
      return this.recordFailure(inst.id, inst.attempts + 1, 'A bank account can’t be used for this payment. Please pay with a card.', b, inst, undefined, true);
    }
    // claim the attempt so two workers can't double charge
    const claimed = await this.prisma.bookingInstallment.updateMany({
      // the amount too: if the vendor lowered it since we read it, the next run charges the new amount
      where: { id: inst.id, status: InstallmentStatus.SCHEDULED, attempts: inst.attempts, amount: inst.amount },
      // what this attempt uses, so receipts and refund wording are right after a bank attempt and then a card
      data: { status: InstallmentStatus.PROCESSING, attempts: { increment: 1 }, payment_method_type: bank ? BANK : 'card' },
    });
    if (claimed.count !== 1) return inst;
    const attempt = inst.attempts + 1;

    try {
      const pi = await StripePayment.chargeSavedCard({
        amount: Number(inst.amount),
        currency: inst.currency,
        customerId: b.customer.billing_id,
        paymentMethodId: paymentMethod,
        bookingId: b.id,
        installmentId: inst.id,
        captureManually,
        // a customer retry resets the attempts, so the key also carries when the row last changed
        idempotencyKey: `inst-${inst.id}-${attempt}-${inst.updated_at ? new Date(inst.updated_at).getTime() : 0}`,
        description: `${b.listing?.title ?? 'Vendly booking'} — ${inst.label}`,
        ...(bank ? { bank: true } : {}),
      });
      if (pi.status === 'processing') {
        // a bank payment on its way: not paid and not failed until Stripe says (payment_intent.succeeded / payment_failed)
        track('payment_processing', b.customer_id, { booking_id: b.id, amount: Number(inst.amount), label: inst.label });
        return this.markClearing(inst.id, pi.id);
      }
      if (pi.status === 'succeeded' || pi.status === 'requires_capture') {
        track(pi.status === 'requires_capture' ? 'payment_authorized' : 'payment_succeeded', b.customer_id, { booking_id: b.id, amount: Number(inst.amount), label: inst.label });
        const marked = await this.markPaid(inst.id, pi.id, pi.status === 'requires_capture');
        await this.undoIfBookingEnded(inst.id);
        // the job may have been completed while the hold was being placed
        if (pi.status === 'requires_capture') return (await this.captureIfCompleted(inst.id)) ?? marked;
        return marked;
      }
      if (NEEDS_CUSTOMER.has(pi.status)) {
        return this.recordFailure(inst.id, attempt, `Your bank needs you to confirm this payment (${pi.status})`, b, inst, pi.id, true);
      }
      return this.recordFailure(inst.id, attempt, `Unexpected payment status ${pi.status}`, b, inst, pi.id);
    } catch (err: any) {
      const message = err?.raw?.message ?? err?.message ?? 'Payment failed';
      const piId = err?.raw?.payment_intent?.id ?? err?.payment_intent?.id;
      return this.recordFailure(inst.id, attempt, message, b, inst, piId, err?.code === 'authentication_required');
    }
  }

  /** True when a booking was cancelled, rejected, or fully refunded by Vendly: nothing more may be kept on it. */
  private bookingEnded(b: { status: BookingStatus; dispute_resolution?: string | null }) {
    return b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED || !!b.dispute_resolution?.startsWith('refund');
  }

  /**
   * A charge that was already on its way when the booking ended (cancelled, or fully refunded after a
   * dispute) lands later: hand it straight back (or release the hold).
   */
  private async undoIfBookingEnded(installmentId: string) {
    const i = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId }, include: { booking: { select: { status: true, dispute_resolution: true } } } });
    if (!i?.booking || !i.payment_intent_id || !this.bookingEnded(i.booking)) return;
    try {
      if (i.status === InstallmentStatus.PROCESSING) {
        await StripePayment.cancelPaymentIntent(i.payment_intent_id);
        await this.prisma.bookingInstallment.update({ where: { id: i.id }, data: { status: InstallmentStatus.CANCELLED } });
      } else if (i.status === InstallmentStatus.PAID) {
        const left = round2(Number(i.amount) - Number(i.refunded_amount));
        if (left <= 0) return;
        const refund = await StripePayment.refundPaymentIntent(i.payment_intent_id, `ended-${i.id}`, left);
        // the charge call and the webhook can both get here; only one records it
        const done = await this.prisma.bookingInstallment.updateMany({ where: { id: i.id, status: InstallmentStatus.PAID, refunded_amount: i.refunded_amount }, data: { refunded_amount: { increment: left }, status: InstallmentStatus.REFUNDED } });
        if (done.count === 1) await this.prisma.paymentTransaction.create({ data: { type: 'booking_refund', provider: 'stripe', reference_number: refund.id, order_id: i.booking_id, status: 'refunded', amount: left, currency: i.currency } });
      }
    } catch (e) {
      this.logger.error(`undo charge ${i.id} on an ended booking`, e);
      Sentry.captureException(e, { tags: { job: 'ended-booking-charge' }, extra: { installment_id: i.id } });
    }
  }

  /**
   * Captures a pay-after-service hold that was placed after the job was marked complete (completion
   * only captures the holds already there). Same capture key as completion, so the two can't both take it.
   */
  private async captureIfCompleted(installmentId: string) {
    const h = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId }, include: { booking: { select: { status: true } } } });
    if (!h?.booking || h.booking.status !== BookingStatus.COMPLETED) return null;
    if (!h.capture_manually || h.kind === SECURITY_DEPOSIT || h.status !== InstallmentStatus.PROCESSING || !h.payment_intent_id) return null;
    return this.captureHold(h);
  }

  /** Takes the installment amount from a card hold (less than the hold when the vendor gave money off). */
  private async captureHold(h: { id: string; payment_intent_id: string | null; amount: unknown }) {
    try {
      await StripePayment.capturePaymentIntent(h.payment_intent_id!, `capture-${h.id}`, Number(h.amount));
      return await this.markPaid(h.id, h.payment_intent_id!, false);
    } catch (e: any) {
      this.logger.error(`capture ${h.id}`, e);
      return this.prisma.bookingInstallment.update({ where: { id: h.id }, data: { status: InstallmentStatus.FAILED, last_error: e?.raw?.message ?? e?.message ?? 'Capture failed' } });
    }
  }

  /** PAID (or authorized, for pay-after-service) and the booking's paid_at on the first success. */
  private async markPaid(installmentId: string, paymentIntentId: string, authorizedOnly: boolean) {
    const marked = await this.prisma.$transaction(async (tx) => {
      let inst: Awaited<ReturnType<typeof tx.bookingInstallment.findUniqueOrThrow>>;
      if (authorizedOnly) {
        inst = await tx.bookingInstallment.update({
          where: { id: installmentId },
          data: { status: InstallmentStatus.PROCESSING, payment_intent_id: paymentIntentId, last_error: null, next_attempt_at: null },
        });
      } else {
        // the charge call and the webhook can both get here: only the call that actually moves it to
        // PAID records the payment and applies what the payment unlocks
        const moved = await tx.bookingInstallment.updateMany({
          where: { id: installmentId, status: { not: InstallmentStatus.PAID } },
          data: { status: InstallmentStatus.PAID, payment_intent_id: paymentIntentId, paid_at: new Date(), last_error: null, next_attempt_at: null, clearing_since: null },
        });
        inst = await tx.bookingInstallment.findUniqueOrThrow({ where: { id: installmentId } });
        if (moved.count !== 1) return inst;
        // a paid add-on that adds time moves the booking's end (only once it's paid)
        if (inst.kind === 'extra') await this.extendForPaidExtra(tx, installmentId);
      }
      await tx.paymentTransaction.create({
        data: {
          user_id: (await tx.booking.findUnique({ where: { id: inst.booking_id }, select: { customer_id: true } }))?.customer_id,
          type: authorizedOnly ? 'booking_authorization' : 'booking_installment',
          provider: 'stripe',
          reference_number: paymentIntentId,
          order_id: inst.booking_id,
          status: authorizedOnly ? 'authorized' : 'succeeded',
          amount: inst.amount,
          currency: inst.currency,
        },
      });
      if (!authorizedOnly) await tx.booking.updateMany({ where: { id: inst.booking_id, paid_at: null }, data: { paid_at: new Date() } });
      // a missed deposit or balance paid in time: the booking is no longer waiting for it
      const custom = inst.kind === 'charge' && (await tx.booking.findUnique({ where: { id: inst.booking_id }, select: { payment_plan: true } }))?.payment_plan === PaymentPlan.CUSTOM;
      const paidKind = inst.kind === 'charge' && !custom ? (inst.sequence === 1 ? 'deposit' : inst.sequence === 2 ? 'balance' : null) : null;
      if (!authorizedOnly && paidKind) {
        await tx.booking.updateMany({ where: { id: inst.booking_id, payment_due_kind: paidKind }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
      }
      // a custom plan: only once none of its payments is still waiting (two can fail before one is paid)
      if (!authorizedOnly && custom) await this.clearCustomDue(tx, inst.booking_id);
      return inst;
    });
    // the customer's receipt; never lets an email problem touch the payment (the hourly sweep catches misses)
    if (!authorizedOnly) await this.sendReceipt(installmentId);
    return marked;
  }

  /**
   * A bank payment was sent and is clearing (about 4 business days): the installment stays PROCESSING
   * with `clearing_since` set. It isn't paid (no receipt, no payout, nothing unlocked) and isn't
   * failed (no retries, and the booking isn't cancelled for non-payment meanwhile).
   */
  private async markClearing(installmentId: string, paymentIntentId: string) {
    const moved = await this.prisma.bookingInstallment.updateMany({
      where: { id: installmentId, status: InstallmentStatus.PROCESSING, clearing_since: null },
      data: { payment_intent_id: paymentIntentId, clearing_since: new Date(), payment_method_type: BANK, last_error: null, next_attempt_at: null },
    });
    const inst = await this.prisma.bookingInstallment.findUniqueOrThrow({ where: { id: installmentId } });
    if (moved.count === 1) {
      // the missed payment is on its way: no "Pending deposit" and no deadline while it clears; if it
      // fails, a fresh window starts then (bankPaymentFailed)
      await this.closeWindowIfFor(inst.booking_id, inst.id);
      const b = await this.prisma.booking.findUnique({ where: { id: inst.booking_id }, select: { customer_id: true, listing: { select: { title: true } } } });
      await this.prisma.paymentTransaction.create({
        data: { user_id: b?.customer_id, type: 'booking_installment', provider: 'stripe', reference_number: paymentIntentId, order_id: inst.booking_id, status: 'processing', amount: inst.amount, currency: inst.currency },
      });
      if (b) {
        const body = `Your bank payment of ${money(inst.amount, inst.currency)} for ${b.listing?.title ?? 'your booking'} (${inst.label}) is processing. Bank payments take ${BANK_CLEARING_TEXT} to clear; we'll let you know if anything goes wrong.`;
        void this.push.sendToUser(b.customer_id, { title: 'Bank payment processing', body, data: { type: 'booking', bookingId: inst.booking_id } }, 'payments');
      }
    }
    return inst;
  }

  /** Whether a bank payment on this booking is still clearing (large bookings, ACH). */
  async hasClearingPayment(bookingId: string) {
    const n = await this.prisma.bookingInstallment.count({ where: { booking_id: bookingId, status: InstallmentStatus.PROCESSING, clearing_since: { not: null } } });
    return n > 0;
  }

  /** Ends a booking's pending-payment window when it was waiting for this installment. True when it did. */
  private async closeWindowIfFor(bookingId: string, installmentId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { payment_due_by: true, payment_due_kind: true, payment_plan: true, installments: { where: { kind: 'charge' }, select: { id: true, sequence: true, status: true, attempts: true } } },
    });
    if (!b?.payment_due_by || dueInstallment(b, b.installments)?.id !== installmentId) return false;
    await this.prisma.booking.updateMany({ where: { id: bookingId, payment_due_by: b.payment_due_by }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
    return true;
  }

  /**
   * A bank payment that was clearing failed (insufficient funds, account closed, the customer's bank
   * refused it): handled like a declined card, except there's no automatic retry on the same account
   * (it would take days again). Deposit plans get a fresh window to pay another way (48 hours on
   * large bookings; the clock doesn't carry on from before the bank payment); other plans wait for the
   * customer to pay with a card.
   */
  private async bankPaymentFailed(inst: { id: string; booking_id: string; attempts: number; label: string; amount: unknown; kind: string; sequence: number }, paymentIntentId: string, reason: string) {
    const moved = await this.prisma.bookingInstallment.updateMany({ where: { id: inst.id, status: InstallmentStatus.PROCESSING, clearing_since: { not: null } }, data: { clearing_since: null } });
    if (moved.count !== 1) return;
    const b = await this.failureBooking(inst.booking_id);
    if (!b) return;
    await this.prisma.paymentTransaction.updateMany({ where: { reference_number: paymentIntentId, type: 'booking_installment', status: 'processing' }, data: { status: 'failed' } });
    if (this.bookingEnded(b)) {
      // the booking ended while it was clearing: nothing is owed any more
      await this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.CANCELLED, last_error: reason } });
      return;
    }
    // a window still open for this payment (from before the fix that pauses it) starts afresh
    if (await this.closeWindowIfFor(b.id, inst.id)) b.payment_due_by = null;
    await this.recordFailure(inst.id, Math.max(1, inst.attempts), reason, b, inst, paymentIntentId, true);
  }

  /**
   * A bank payment that had cleared (and was treated as paid) came back later, e.g. returned by the
   * customer's bank. Like a refund the other way round: the installment is unpaid again (FAILED), the
   * vendor's part comes back from their balance if they were already paid for it (an early deposit
   * release too), and the customer is asked to pay again (the usual window on deposit plans while the
   * booking is still on). Vendly's admins hear about it. Under the booking lock; safe to repeat.
   */
  async bankPaymentReturned(installmentId: string, paymentIntentId: string, reason: string) {
    const row = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId }, select: { booking_id: true } });
    if (!row) return null;
    return withBookingLock(this.prisma, row.booking_id, async () => {
      const inst = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId } });
      if (!inst || inst.status !== InstallmentStatus.PAID || inst.payment_intent_id !== paymentIntentId) return null;
      const booking = await this.prisma.booking.findUnique({
        where: { id: inst.booking_id },
        select: { id: true, vendor_id: true, customer_id: true, status: true, currency: true, early_released_amount: true, released_gross: true, commission_amount: true, installments: { select: { id: true, status: true } } },
      });
      if (!booking) return null;
      // part of it had been refunded: only what the customer kept is owed again (the refund came out
      // of the vendor's part first, so the fee stays whole unless less than it is left)
      const refunded = Number(inst.refunded_amount);
      const owed = round2(Number(inst.amount) - refunded);
      const owedFee = round2(Math.min(Number(inst.fee_amount), Math.max(0, owed)));
      const moved = await this.prisma.bookingInstallment.updateMany({
        where: { id: inst.id, status: InstallmentStatus.PAID, payment_intent_id: paymentIntentId },
        data: {
          status: owed > 0 ? InstallmentStatus.FAILED : InstallmentStatus.CANCELLED,
          paid_at: null, paid_out_at: null, last_error: `Returned by your bank: ${reason}`, next_attempt_at: null, clearing_since: null,
          ...(refunded > 0 ? { amount: Math.max(0, owed), fee_amount: owedFee, refunded_amount: 0 } : {}),
        },
      });
      if (moved.count !== 1) return null;
      const currency = booking.currency ?? 'usd';
      await this.prisma.paymentTransaction.create({
        data: { user_id: booking.customer_id, type: 'booking_payment_returned', provider: 'stripe', reference_number: paymentIntentId, order_id: booking.id, status: 'failed', amount: -Number(inst.amount), currency },
      });
      // what the vendor already received for it comes back from their balance (less Vendly's commission on it)
      let recovered = 0;
      const part = vendorPortion(inst);
      if (inst.paid_out_at && part > 0) {
        const rate = Number(booking.released_gross ?? 0) > 0 ? Number(booking.commission_amount ?? 0) / Number(booking.released_gross) : currentFees().commission / 100;
        recovered = round2(part * (1 - rate));
        const commissionBack = round2(part - recovered);
        if (recovered > 0) await this.recordRecovery(booking.vendor_id, booking.id, -recovered, currency);
        if (commissionBack > 0) {
          await this.prisma.paymentTransaction.create({ data: { user_id: booking.vendor_id, type: 'vendly_commission', provider: 'stripe', reference_number: booking.id, status: 'succeeded', amount: -commissionBack, currency } });
        }
      } else if (inst.kind === 'charge' && inst.sequence === 1 && Number(booking.early_released_amount ?? 0) > 0) {
        // the deposit was paid out early: owed back now; the final payout no longer takes it off
        recovered = Number(booking.early_released_amount);
        await this.prisma.booking.update({ where: { id: booking.id }, data: { early_released_amount: 0 } });
        await this.recordRecovery(booking.vendor_id, booking.id, -recovered, currency);
      }
      // nothing paid on it any more
      if (!booking.installments.some((i) => i.id !== inst.id && isPaid(i))) await this.prisma.booking.update({ where: { id: booking.id }, data: { paid_at: null } });

      const b = await this.failureBooking(booking.id);
      if (b && !this.bookingEnded(b) && owed > 0) {
        // a fresh window for this payment (recordFailure uses it only while the booking is still to happen)
        if (await this.closeWindowIfFor(b.id, inst.id)) b.payment_due_by = null;
        await this.recordFailure(inst.id, Math.max(1, inst.attempts), `Returned by your bank: ${reason}`, b, { ...inst, amount: owed }, paymentIntentId, true);
      }
      const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true } });
      const partly = refunded > 0 ? ` ${money(refunded, currency)} of it had been refunded, so ${money(Math.max(0, owed), currency)} is owed again.` : '';
      const body = `A bank payment of ${money(inst.amount, currency)} on booking ${booking.id} (${inst.label}) was returned after it cleared: ${reason}.${partly}${recovered > 0 ? ` ${money(recovered, currency)} is being recovered from the vendor's balance.` : ''}${owed > 0 ? ' The customer was asked to pay again.' : ''}`;
      for (const a of admins) void this.push.sendToUser(a.id, { title: 'Bank payment returned', body, data: { type: 'booking', bookingId: booking.id } });
      Sentry.captureMessage('Bank payment returned after it cleared', { level: 'warning', tags: { job: 'bank-return' }, extra: { booking_id: booking.id, installment_id: inst.id, recovered } });
      return { recovered };
    });
  }

  /** What recordFailure needs about a booking. */
  private failureBooking(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, customer_id: true, vendor_id: true, status: true, payment_plan: true, deposit_rules: true, payment_due_by: true, amount: true, service_fee: true, dispute_resolution: true, payment_method_type: true,
        listing: { select: { title: true } }, customer: { select: { email: true, name: true } }, vendor: { select: { email: true, name: true } },
      },
    });
  }

  /** Is this the booking's first charge (a custom plan's deposit, custom-plan.ts)? */
  private async isFirstCharge(bookingId: string, installmentId: string) {
    const rows = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, kind: 'charge' }, select: { id: true, kind: true, sequence: true, status: true } });
    return firstCharge(rows)?.id === installmentId;
  }

  /** Ends a custom plan's pending-payment window once no payment it was waiting for is still unpaid. */
  private async clearCustomDue(tx: Prisma.TransactionClient, bookingId: string) {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { payment_plan: true, payment_due_kind: true, installments: { where: { kind: 'charge' }, select: { sequence: true, status: true, attempts: true } } } });
    if (!b?.payment_due_kind) return;
    const waiting = dueInstallment(b, b.installments);
    if (waiting && !isPaidCharge(waiting)) return;
    await tx.booking.updateMany({ where: { id: bookingId, payment_due_kind: b.payment_due_kind }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
  }

  /** Charges a booking's payments that are due now (a custom plan's first payment once the customer agrees). */
  async chargeDueNow(bookingId: string, now = new Date()) {
    const due = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, kind: 'charge', status: InstallmentStatus.SCHEDULED, attempts: 0, due_at: { lte: now } }, select: { id: true }, orderBy: { sequence: 'asc' } });
    for (const d of due) await this.chargeInstallment(d.id).catch((e) => this.logger.error(`charge ${d.id}`, e));
    return due.length;
  }

  /** Moves the booking's end later for a paid add-on that adds time; a booking with only a start ends that long after it starts. */
  private async extendForPaidExtra(tx: Prisma.TransactionClient, installmentId: string) {
    const extra = await tx.bookingExtra.findFirst({ where: { installment_id: installmentId }, select: { kind: true, extends_minutes: true, booking_id: true } });
    if (!extra || extra.kind !== AddOnKind.ADD_ON || !extra.extends_minutes) return;
    const b = await tx.booking.findUnique({ where: { id: extra.booking_id }, select: { status: true, event_start_at: true, event_end_at: true } });
    if (!b || b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED) return;
    const from = b.event_end_at ?? b.event_start_at;
    if (!from) return;
    await tx.booking.update({ where: { id: extra.booking_id }, data: { event_end_at: new Date(from.getTime() + extra.extends_minutes * 60_000) } });
  }

  private async recordFailure(
    installmentId: string,
    attempt: number,
    message: string,
    b: FailureBooking,
    inst: { label: string; amount: unknown; kind?: string; sequence?: number },
    paymentIntentId?: string,
    needsCustomer = false,
  ) {
    // deposit plans: 12 hours to pay, then the booking is cancelled (payment-due.ts)
    // a custom plan's first charge is its deposit, the later ones balance payments
    const first = b.payment_plan === PaymentPlan.CUSTOM && inst.kind === 'charge' ? await this.isFirstCharge(b.id, installmentId) : false;
    const dueKind = inst.kind && inst.sequence ? dueKindFor(b, { kind: inst.kind, sequence: inst.sequence, first }) : null;
    // once the job is done (a custom plan's payments after the service) there's no booking to cancel:
    // the usual retries and "Payment problem" instead of a deadline that would never be enforced
    const stillOn = !b.status || b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.IN_PROGRESS;
    if (dueKind && stillOn) return this.recordMissedDeposit(installmentId, attempt, message, b, inst, dueKind, paymentIntentId, needsCustomer);
    const exhausted = attempt >= MAX_ATTEMPTS || needsCustomer;
    track('payment_failed', b.customer_id, { booking_id: b.id, attempt, final: exhausted, needs_customer: needsCustomer });
    const updated = await this.prisma.bookingInstallment.update({
      where: { id: installmentId },
      data: {
        status: exhausted ? InstallmentStatus.FAILED : InstallmentStatus.SCHEDULED,
        attempts: attempt,
        next_attempt_at: exhausted ? null : new Date(Date.now() + RETRY_INTERVAL_MS),
        last_error: message,
        payment_intent_id: paymentIntentId ?? undefined,
      },
    });
    const title = b.listing?.title ?? 'your booking';
    const clientUrl = appConfig().app.client_app_url;
    const body = exhausted
      ? `We couldn't take the ${inst.label.toLowerCase()} of $${Number(inst.amount).toFixed(2)} for ${title}${isBank(b.payment_method_type) ? ` from your bank account (${message})` : ''}. Please pay with another card to keep your booking.`
      : `We couldn't take the ${inst.label.toLowerCase()} of $${Number(inst.amount).toFixed(2)} for ${title} (${message}). We'll try again in 24 hours, or you can update your card now.`;
    if (b.customer.email) {
      await this.mail
        .sendBookingNotification({ to: b.customer.email, recipientName: b.customer.name ?? '', subject: `Payment problem — ${title}`, message: body, status: 'PAYMENT_FAILED', listingTitle: title, amount: Number(inst.amount), ctaUrl: `${clientUrl}/bookings/${b.id}` })
        .catch(() => null);
    }
    void this.push.sendToUser(b.customer_id, { title: 'Payment problem', body, data: { type: 'booking', bookingId: b.id } }, 'payments');
    return updated;
  }

  /**
   * A deposit plan's deposit or balance didn't go through: the customer has 12 hours from the first
   * failure to pay it, 48 on a large booking (the deadline doesn't move on later failures). One
   * automatic retry about 6 hours in (24 on a large booking), unless the bank needs the customer. The
   * customer hears it with the amount, the deadline in their time zone and a pay link; the vendor
   * hears the payment is pending (once).
   */
  private async recordMissedDeposit(
    installmentId: string,
    attempt: number,
    message: string,
    b: FailureBooking,
    inst: { label: string; amount: unknown },
    kind: PaymentDueKind,
    paymentIntentId: string | undefined,
    needsCustomer: boolean,
  ) {
    const now = new Date();
    // 12 hours, or 48 on a large booking (payment-due.ts)
    const rules = paymentDueRules(isLargeBooking(b));
    // only the first failure starts the clock
    const started = !b.payment_due_by;
    const dueBy = b.payment_due_by ?? paymentDueBy(now, rules.dueHours);
    if (started) {
      await this.prisma.booking.updateMany({ where: { id: b.id, payment_due_by: null }, data: { payment_due_by: dueBy, payment_due_kind: kind, payment_due_reminded_at: null } });
    }
    const retryAt = attempt === 1 && !needsCustomer ? autoRetryAt(now, dueBy, rules.retryHours) : null;
    track('payment_failed', b.customer_id, { booking_id: b.id, attempt, final: !retryAt, needs_customer: needsCustomer, due: kind });
    const updated = await this.prisma.bookingInstallment.update({
      where: { id: installmentId },
      data: {
        status: retryAt ? InstallmentStatus.SCHEDULED : InstallmentStatus.FAILED,
        attempts: attempt,
        next_attempt_at: retryAt,
        last_error: message,
        payment_intent_id: paymentIntentId ?? undefined,
      },
    });
    await this.notifyPaymentDue(b, { kind, amount: Number(inst.amount), label: inst.label, dueBy, reason: message, retryAt, tellVendor: started });
    return updated;
  }

  /**
   * Tells the customer a deposit or balance is waiting (amount, deadline in their time zone, pay link),
   * and with `tellVendor` the vendor that the payment is pending. Also the ~2-hours-left reminder.
   */
  async notifyPaymentDue(
    b: { id: string; customer_id: string; vendor_id?: string; amount?: unknown; service_fee?: unknown; payment_method_type?: string | null; listing: { title: string } | null; customer: { email: string | null; name: string | null }; vendor?: { email: string | null; name: string | null } | null },
    p: { kind: PaymentDueKind; amount: number; label?: string; dueBy: Date; reason?: string; retryAt?: Date | null; tellVendor?: boolean; reminder?: boolean },
  ) {
    const rules = paymentDueRules(isLargeBooking(b));
    const title = b.listing?.title ?? 'your booking';
    const clientUrl = appConfig().app.client_app_url;
    // the time zone the booking was made in (the customer's, and the event's)
    const contract = await Promise.resolve()
      .then(() => this.prisma.bookingContract.findFirst({ where: { booking_id: b.id }, orderBy: { version: 'desc' }, select: { merge_data: true } }))
      .catch(() => null);
    const tz = (contract?.merge_data as Record<string, unknown> | null)?.timezone as string | undefined;
    const when = deadlineText(p.dueBy, tz);
    const what = p.kind === 'deposit' ? 'deposit' : 'balance';
    const amount = money(p.amount);
    // paying from a bank account (large bookings): its payment failed, a card is the quick way to pay
    const byBank = isBank(b.payment_method_type);
    const body = p.reminder
      ? `About ${rules.reminderHours} hours left: pay the ${amount} ${what} for ${title} by ${when}, or the booking will be cancelled.`
      : byBank
        ? `We couldn't take the ${amount} ${what} for ${title} from your bank account${p.reason ? ` (${p.reason})` : ''}. Pay it by ${when} with a card, or from your bank account again, to keep your booking. If it isn't paid by then, the booking is cancelled.`
        : `We couldn't take the ${amount} ${what} for ${title}${p.reason ? ` (${p.reason})` : ''}. Pay it by ${when} with your card or another card to keep your booking. If it isn't paid by then, the booking is cancelled.${p.retryAt ? ' We will also try your card again once in a few hours.' : ''}`;
    const payUrl = `${clientUrl}/bookings/${b.id}?pay=1`;
    if (b.customer.email) {
      await this.mail
        .sendBookingNotification({
          to: b.customer.email,
          recipientName: b.customer.name ?? '',
          subject: p.reminder ? `${rules.reminderHours} hours left to pay — ${title}` : `Payment needed by ${when} — ${title}`,
          message: body,
          status: 'PAYMENT_FAILED',
          listingTitle: title,
          amount: p.amount,
          lines: [{ label: 'Pay by', value: when }],
          ctaUrl: payUrl,
          ctaLabel: `Pay ${amount}`,
        })
        .catch(() => null);
    }
    void this.push.sendToUser(b.customer_id, { title: p.reminder ? 'Payment due soon' : `Pending ${what}`, body, data: { type: 'booking', bookingId: b.id } }, 'payments');
    if (p.tellVendor && b.vendor_id) {
      const vendorBody = `${b.customer.name ?? 'The customer'}'s ${what} of ${amount} for ${title} didn't go through. They have until ${when} (${rules.dueHours} hours) to pay. If they don't, the booking is cancelled automatically and you keep what the cancellation terms give you.`;
      void this.push.sendToUser(b.vendor_id, { title: `Pending ${what}`, body: vendorBody, data: { type: 'booking', bookingId: b.id } }, 'booking_updates');
      if (b.vendor?.email) {
        await this.mail
          .sendBookingNotification({ to: b.vendor.email, recipientName: b.vendor.name ?? '', subject: `Payment pending — ${title}`, message: vendorBody, status: 'PENDING', listingTitle: title, ctaUrl: `${clientUrl}/vendor/bookings/${b.id}`, topic: 'booking_updates' })
          .catch(() => null);
      }
    }
  }

  /** Customer retries a failed installment, optionally with a different saved card. */
  async retryInstallment(bookingId: string, installmentId: string, customerId: string, paymentMethodId?: string) {
    const inst = await this.prisma.bookingInstallment.findFirst({
      where: { id: installmentId, booking_id: bookingId },
      include: { booking: { select: { customer_id: true, status: true, dispute_resolution: true, amount: true, service_fee: true, payment_plan: true, security_deposit: true } } },
    });
    if (!inst) throw new NotFoundException('Installment not found');
    if (inst.booking.customer_id !== customerId) throw new ForbiddenException('Access denied');
    // nothing more is charged on a cancelled, declined or fully refunded booking
    if (this.bookingEnded(inst.booking)) throw new BadRequestException('This booking has ended, so there is nothing more to pay.');
    if (isClearing(inst)) throw new ConflictException(`A bank payment for this is on its way. It takes ${BANK_CLEARING_TEXT} to clear.`);
    if (inst.status !== InstallmentStatus.FAILED && inst.status !== InstallmentStatus.SCHEDULED) throw new BadRequestException('This installment is not waiting for payment');
    if (paymentMethodId) {
      const { type } = await this.ownedPaymentMethod(customerId, paymentMethodId);
      if (isBank(type)) {
        const why = bankNotAllowedReason({ total: Number(inst.booking.amount ?? 0) + Number(inst.booking.service_fee ?? 0), plan: inst.booking.payment_plan, securityDeposit: inst.booking.security_deposit });
        if (why || inst.capture_manually) throw new BadRequestException(why ?? 'This payment needs a card. Please choose a card.');
      }
      await this.prisma.booking.update({ where: { id: bookingId }, data: { payment_method_id: paymentMethodId, payment_method_type: isBank(type) ? BANK : null } });
    }
    // a fresh attempt window: the retry counter starts over for the new card. Only while the row is as
    // read: the sweep or the automatic retry may have just claimed it, and resetting it then would charge twice
    const reset = await this.prisma.bookingInstallment.updateMany({
      where: { id: inst.id, status: inst.status, attempts: inst.attempts },
      data: { status: InstallmentStatus.SCHEDULED, attempts: 0, next_attempt_at: null },
    });
    // 409: the apps show it as "in progress" and reload, not as a failed payment
    if (reset.count !== 1) throw new ConflictException('A payment is already going through.');
    const result = await this.chargeInstallment(inst.id, paymentMethodId);
    return { success: result?.status === InstallmentStatus.PAID || result?.status === InstallmentStatus.PROCESSING, data: result };
  }

  /** Every 15 minutes: charge what is due and retry what failed earlier. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  cronDueCharges() {
    return withJobLock(this.prisma, 'due-charges', () => this.runDueCharges());
  }

  async runDueCharges(now = new Date()) {
    const due = await this.prisma.bookingInstallment.findMany({
      where: { status: InstallmentStatus.SCHEDULED, OR: [{ attempts: 0, due_at: { lte: now } }, { attempts: { gt: 0 }, next_attempt_at: { lte: now } }] },
      select: { id: true },
      // oldest first; every attempt moves its row on (charged, retry later, or waiting for the customer)
      orderBy: [{ due_at: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    for (const d of due)
      await this.chargeInstallment(d.id).catch((e) => {
        this.logger.error(`due charge ${d.id}`, e);
        Sentry.captureException(e, { tags: { job: 'due-charges' }, extra: { installment_id: d.id } });
      });
    return due.length;
  }

  // ─── Hold, release, refunds ───────────────────────────────────────────────

  /** Vendor marked the job complete: capture pay-after holds, start the release clock. */
  async onBookingCompleted(bookingId: string, completedAt = new Date()) {
    // the rental security deposit is settled by the return, not by completion
    // a failure here must not stop the release clock below, or the vendor would never be paid automatically
    await withBookingLock(this.prisma, bookingId, async () => {
      const holds = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, capture_manually: true, kind: { not: SECURITY_DEPOSIT }, status: InstallmentStatus.PROCESSING, payment_intent_id: { not: null } } });
      for (const h of holds) await this.captureHold(h);
    }).catch((e) => {
      this.logger.error(`captures for ${bookingId}`, e);
      Sentry.captureException(e, { tags: { job: 'completion-capture' }, extra: { booking_id: bookingId } });
    });
    // Only the vendor's proof shortens the wait, and never to less than 48h after completion: a photo
    // uploaded days before (setup shots, or on purpose) would otherwise release the money at once and
    // leave the customer no time to report a problem.
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { vendor_id: true } });
    const lastProof = booking?.vendor_id
      ? await this.prisma.bookingProof.findFirst({ where: { booking_id: bookingId, uploader_id: booking.vendor_id }, orderBy: { created_at: 'desc' }, select: { created_at: true } })
      : null;
    const auto = new Date(completedAt.getTime() + AUTO_RELEASE_DAYS * DAY);
    const byProof = lastProof ? new Date(Math.max(lastProof.created_at.getTime(), completedAt.getTime()) + PROOF_RELEASE_HOURS * HOUR) : null;
    const releaseAt = byProof && byProof < auto ? byProof : auto;
    await this.prisma.booking.updateMany({ where: { id: bookingId, released_at: null }, data: { release_at: releaseAt } });
  }

  /** Proof uploaded after completion pulls the release forward to 48h from now. */
  async onProofUploaded(bookingId: string, at = new Date()) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true, release_at: true, released_at: true } });
    if (!b || b.status !== BookingStatus.COMPLETED || b.released_at) return;
    const candidate = new Date(at.getTime() + PROOF_RELEASE_HOURS * HOUR);
    if (!b.release_at || candidate < b.release_at) await this.prisma.booking.update({ where: { id: bookingId }, data: { release_at: candidate } });
  }

  /** Customer confirms the work (or approves the delivery): release now. */
  async approveBooking(bookingId: string, customerId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, status: true, released_at: true, dispute_opened_at: true, dispute_resolved_at: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== customerId) throw new ForbiddenException('Access denied');
    if (b.status !== BookingStatus.COMPLETED) throw new BadRequestException('You can approve once the vendor marks the booking complete.');
    if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute.');
    await this.prisma.booking.update({ where: { id: bookingId }, data: { customer_approved_at: new Date(), release_at: new Date() } });
    await this.releaseBooking(bookingId);
    return { success: true };
  }

  /**
   * Customer reports a problem: what went wrong, what kind of problem, what they ask for (a partial
   * refund stays under the vendor's part of what they paid, the most Vendly can give back short of a
   * full refund) and up to 10 photos, kept in private storage. Older apps send the reason alone.
   * Open once the service has started, or on a confirmed booking whose start time has passed (the
   * vendor may not have shown up).
   */
  async openDispute(bookingId: string, customerId: string, input: string | DisputeInput, photos: { buffer: Buffer; size?: number }[] = []) {
    const d: DisputeInput = typeof input === 'string' ? { reason: input } : input;
    const reason = d.reason.trim();
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        customer_id: true, status: true, amount: true, service_fee: true, paid_at: true, payment_transaction_id: true, released_at: true, dispute_opened_at: true, event_start_at: true, scheduled_at: true,
        installments: { select: { kind: true, status: true, amount: true, fee_amount: true, refunded_amount: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== customerId) throw new ForbiddenException('Access denied');
    if (b.released_at) throw new BadRequestException('Payment for this booking has already been released. Contact support.');
    if (b.dispute_opened_at) throw new BadRequestException('A dispute is already open.');
    if (!([BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] as BookingStatus[]).includes(b.status) && !pastStartNotStarted(b)) {
      throw new BadRequestException(b.status === BookingStatus.CONFIRMED ? 'You can report a problem once the booking’s start time has passed.' : 'You can dispute a booking once the service has started.');
    }
    if (reason.length < 10) throw new BadRequestException('Tell Vendly what went wrong (at least 10 characters).');

    let requested: number | null = null;
    if (d.requested_amount != null && d.outcome !== 'partial_refund') throw new BadRequestException('An amount is only needed for a partial refund.');
    if (d.outcome === 'partial_refund') {
      requested = round2(Number(d.requested_amount ?? 0));
      const { paid, vendorPaid } = await this.paidSoFar(bookingId, b);
      if (!(requested > 0)) throw new BadRequestException('Enter how much you’d like back.');
      // never more than was actually paid on the booking (large bookings can be well over $100,000)
      if (requested > paid) throw new BadRequestException(paid > 0 ? `You can ask for up to ${money(paid)}, what you’ve paid for this booking.` : 'Nothing has been paid on this booking yet.');
      // the same limit an admin has for a partial refund: the Vendly Protection fee comes back only with a full refund
      if (requested >= vendorPaid) {
        throw new BadRequestException(
          vendorPaid > 0
            ? `A partial refund must be less than $${vendorPaid.toFixed(2)}, the vendor’s part of what you’ve paid. To ask for everything back, choose a full refund.`
            : 'Nothing you’ve paid can be partly refunded yet. Choose a full refund instead.',
        );
      }
    }
    const exts = checkDisputePhotos(photos);
    const keys = photos.length ? await storeDisputePhotos(bookingId, photos, exts) : [];
    let claimed = false;
    try {
      // claimed only if no other report got there first (two submissions at once must not overwrite each other)
      const res = await this.prisma.booking.updateMany({
        where: { id: bookingId, dispute_opened_at: null },
        data: {
          dispute_opened_at: new Date(),
          dispute_reason: reason,
          dispute_category: d.category ?? null,
          dispute_outcome: d.outcome ?? null,
          dispute_requested_amount: requested,
          dispute_photos: keys,
        },
      });
      claimed = res.count === 1;
    } catch (err) {
      await removeDisputePhotos(keys);
      throw err;
    }
    if (!claimed) {
      await removeDisputePhotos(keys);
      throw new BadRequestException('A problem was already reported on this booking.');
    }
    track('dispute_opened', customerId, { booking_id: bookingId, category: d.category ?? null, outcome: d.outcome ?? null, photos: keys.length });
    await this.notifyDispute(bookingId, reason, { category: d.category, outcome: d.outcome, requested_amount: requested, photos: keys.length }).catch((e) => this.logger.error(`dispute notices ${bookingId}`, e));
    return { success: true };
  }

  /**
   * What the customer has paid for a booking, less what was already refunded, and the vendor's part
   * of it (the Vendly Protection fee left out): installments plus any one-off Checkout payment.
   */
  private async paidSoFar(bookingId: string, b: CheckoutBooking): Promise<{ paid: number; vendorPaid: number }> {
    const paid = (b.installments ?? []).filter(isPaid);
    const checkout = await this.checkoutPart(bookingId, b);
    return {
      paid: round2(paid.reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0) + (checkout?.paid ?? 0)),
      vendorPaid: round2(paid.reduce((s, i) => s + vendorPortion(i), 0) + (checkout?.vendorPaid ?? 0)),
    };
  }

  /**
   * The part of a booking paid in one go through hosted Checkout (bookings from before payment
   * plans; Pay now still opens it for a booking without a plan), or null when there is none. It has
   * no installment: its payment is the booking's amount plus fee, and its refunds are the
   * `booking_refund` rows (order_id = the booking) that aren't refunds of installments.
   * Cancelling settles against it too (BookingService.cancellationTerms).
   */
  async checkoutPart(bookingId: string, b: CheckoutBooking): Promise<{ paid: number; vendorPaid: number; refunded: number } | null> {
    const installments = b.installments ?? [];
    if (!b.paid_at || installments.some((i) => i.kind === 'charge')) return null;
    // with other installments (an add-on) paid_at alone doesn't show that, so the checkout payment must be on record
    if (installments.length) {
      const recorded = b.payment_transaction_id
        ? await this.prisma.paymentTransaction.count({ where: { reference_number: b.payment_transaction_id, type: 'booking_payment', status: 'succeeded' } })
        : 0;
      if (!recorded) return null;
    }
    const rows = await this.prisma.paymentTransaction.aggregate({ where: { type: 'booking_refund', status: 'refunded', order_id: bookingId }, _sum: { amount: true } });
    const fromInstallments = installments.reduce((s, i) => s + Number(i.refunded_amount), 0);
    const refunded = Math.max(0, round2(Number(rows?._sum?.amount ?? 0) - fromInstallments));
    return {
      paid: Math.max(0, round2(Number(b.amount ?? 0) + Number(b.service_fee ?? 0) - refunded)),
      // refunds come out of the vendor's price first (a customer cancellation keeps the fee)
      vendorPaid: Math.max(0, round2(Number(b.amount ?? 0) - refunded)),
      refunded,
    };
  }

  /** Refunds `amount` of a booking's one-off Checkout payment (as a cancellation does) and records it. */
  private async refundCheckout(b: { id: string; customer_id?: string | null; payment_transaction_id?: string | null; currency?: string | null }, amount: number, reasonKey: string) {
    if (amount <= 0) return 0;
    const ref = b.payment_transaction_id ?? '';
    const session = ref.startsWith('cs_') ? await StripePayment.retrieveCheckoutSession(ref) : null;
    const paymentIntentId = ref.startsWith('pi_') ? ref : typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id;
    if (!paymentIntentId) throw new BadRequestException('The card payment for this booking could not be found, so nothing was refunded. Refund it in Stripe by hand.');
    // keyed on the amount too: a retry of the same decision never refunds twice
    const refund = await StripePayment.refundPaymentIntent(paymentIntentId, `${reasonKey}-checkout-${Math.round(amount * 100)}`, amount);
    await this.prisma.paymentTransaction.create({
      data: { user_id: b.customer_id ?? null, type: 'booking_refund', provider: 'stripe', reference_number: refund.id, order_id: b.id, status: 'refunded', amount, currency: b.currency ?? 'usd' },
    });
    return amount;
  }

  /** The vendor and Vendly's admins hear about a new dispute straight away; the payout stays held meanwhile. */
  private async notifyDispute(bookingId: string, reason: string, ask: { category?: string | null; outcome?: string | null; requested_amount?: number | null; photos?: number } = {}) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { vendor_id: true, listing: { select: { title: true } }, customer: { select: { name: true } }, vendor: { select: { email: true, name: true } } },
    });
    if (!b) return;
    const title = b.listing?.title ?? 'a booking';
    const who = b.customer?.name ?? 'The customer';
    const what = describeDisputeAsk(ask);
    const photos = ask.photos ? ` They added ${ask.photos} photo${ask.photos === 1 ? '' : 's'}.` : '';
    const body = `${who} reported a problem with ${title}${what ? ` (${what})` : ''}: "${reason.slice(0, 300)}".${photos} Your payment for this booking is held while Vendly looks into it. Reply from the booking to give your side.`;
    void this.push.sendToUser(b.vendor_id, { title: 'A customer reported a problem', body, data: { type: 'booking', bookingId } });
    if (b.vendor?.email) {
      await this.mail
        .sendBookingNotification({ to: b.vendor.email, recipientName: b.vendor.name ?? '', subject: `Problem reported — ${title}`, message: body, status: 'DISPUTED', listingTitle: title, ctaUrl: `${appConfig().app.client_app_url}/vendor/bookings/${bookingId}` })
        .catch(() => null);
    }
    const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true } });
    for (const a of admins) void this.push.sendToUser(a.id, { title: 'New dispute', body: `${who} opened a dispute on ${title}${what ? ` (${what})` : ''}.`, data: { type: 'dispute', bookingId } });
  }

  /** The vendor's side of an open dispute, for Vendly to read before deciding. Can be updated until it's resolved. */
  async replyToDispute(bookingId: string, vendorId: string, reply: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { vendor_id: true, dispute_opened_at: true, dispute_resolved_at: true, listing: { select: { title: true } } } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (!b.dispute_opened_at || b.dispute_resolved_at) throw new BadRequestException('This booking has no open dispute.');
    const text = reply.trim();
    await this.prisma.booking.update({ where: { id: bookingId }, data: { dispute_vendor_reply: text, dispute_vendor_replied_at: new Date() } });
    const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true } });
    for (const a of admins) void this.push.sendToUser(a.id, { title: 'Vendor replied to a dispute', body: `The vendor answered the dispute on ${b.listing?.title ?? 'a booking'}.`, data: { type: 'dispute', bookingId } });
    track('dispute_vendor_replied', vendorId, { booking_id: bookingId });
    return { success: true, data: { dispute_vendor_reply: text } };
  }

  /** Hourly: pay vendors for completed bookings whose release time has passed and that aren't disputed. */
  @Cron(CronExpression.EVERY_HOUR)
  cronReleases() {
    return withJobLock(this.prisma, 'releases', () => this.runReleases());
  }

  async runReleases(now = new Date()) {
    const due = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.COMPLETED,
        released_at: null,
        release_at: { lte: now },
        OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }],
        // only what releaseBooking would act on, so bookings it skips can't fill the batch: something
        // was paid, and no rented item is still out
        paid_at: { not: null },
        rental_reservations: { none: { status: 'ACTIVE' } },
        installments: { none: { status: InstallmentStatus.PROCESSING, clearing_since: { not: null } } },
      },
      select: { id: true },
      orderBy: [{ release_at: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    for (const b of due)
      await this.releaseBooking(b.id).catch((e) => {
        this.logger.error(`release ${b.id}`, e);
        Sentry.captureException(e, { tags: { job: 'releases' }, extra: { booking_id: b.id } });
      });
    return due.length;
  }

  /**
   * Pays the vendor for a completed booking. Vendor share = paid installments − Vendly fee − refunds
   * − Vendly commission − any deposit already paid out early. A negative Vendly balance (money the
   * vendor owes back from an earlier early release) is recovered first.
   */
  async releaseBooking(bookingId: string) {
    const res = await withBookingLock(this.prisma, bookingId, () => this.releaseBookingLocked(bookingId));
    // the money on the booking is final once the vendor is paid: the customer gets the final invoice
    await this.sendFinalInvoice(bookingId);
    return res;
  }

  private async releaseBookingLocked(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, released_at: true, currency: true, vendor_id: true, amount: true, service_fee: true, paid_at: true, payment_transaction_id: true, payout_credited_at: true, dispute_opened_at: true, dispute_resolved_at: true, early_released_amount: true, vendor: { select: { stripe_connect_id: true, balance: true } }, installments: true },
    });
    if (!b || b.status !== BookingStatus.COMPLETED || b.released_at) return null;
    if (b.dispute_opened_at && !b.dispute_resolved_at) return null;
    // nothing paid yet (a failed charge, an unpaid checkout): nothing to release. It stays unreleased so
    // it is paid out once the customer pays (the sweep only picks paid bookings)
    if (!b.paid_at) return null;
    // rentals are paid out once the vendor has checked the items back in
    const outstanding = await this.prisma.rentalReservation.count({ where: { booking_id: bookingId, status: 'ACTIVE' } });
    if (outstanding > 0) return null;
    // a bank payment still clearing: the vendor is paid once it has (never on money that may not arrive)
    if (b.installments.some(isClearing)) return null;
    // only what was actually paid (and not paid out already); an installment refunded past the
    // vendor's part (fee included) counts as nothing, never as minus
    const paid = b.installments.filter((i) => isPaid(i) && !i.paid_out_at);
    // legacy checkout bookings have no payment-plan charges: their price was paid in one go, less
    // anything refunded from it since (a partial refund after a dispute)
    let legacy = 0;
    if (!b.payout_credited_at) legacy = (await this.checkoutPart(bookingId, b))?.vendorPaid ?? 0;
    const gross = round2(legacy + paid.reduce((sum, i) => sum + vendorPortion(i), 0));
    const commission = round2((Math.max(0, gross) * currentFees().commission) / 100);
    const share = round2(gross - commission - Number(b.early_released_amount ?? 0));

    const now = new Date();
    // both or neither: an installment left unmarked would be paid out again by the late-payout sweep
    const claimed = await this.prisma.$transaction(async (tx) => {
      const c = await tx.booking.updateMany({
        where: { id: bookingId, released_at: null },
        data: { released_at: now, payout_credited_at: now, commission_amount: commission, released_gross: gross },
      });
      // extras paid from now on are paid out on their own (payOutLateInstallments)
      if (c.count === 1 && paid.length) await tx.bookingInstallment.updateMany({ where: { id: { in: paid.map((i) => i.id) }, paid_out_at: null }, data: { paid_out_at: now } });
      return c;
    });
    if (claimed.count !== 1) return null;
    track('payout_released', b.vendor_id, { booking_id: bookingId, share, commission });
    const currency = b.currency ?? 'usd';
    if (commission > 0) {
      await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'vendly_commission', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: commission, currency } });
    }
    if (share <= 0) {
      // nothing left to send (or the early release was more than earned): the difference is owed back
      if (share < 0) await this.recordRecovery(b.vendor_id, bookingId, share, currency);
      return null;
    }

    // money the vendor owes from earlier comes off this payout first
    const owed = Math.max(0, -Number(b.vendor.balance ?? 0));
    const offset = round2(Math.min(owed, share));
    const toPay = round2(share - offset);
    if (offset > 0) {
      await this.prisma.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: offset } } });
      await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'payout_recovery_settled', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: offset, currency } });
    }
    if (toPay <= 0) return 'recovered';

    if (b.vendor.stripe_connect_id) {
      try {
        const transfer = await StripePayment.transferForBooking({ amount: toPay, currency, accountId: b.vendor.stripe_connect_id, bookingId, idempotencyKey: `release-${bookingId}` });
        await this.prisma.booking.update({ where: { id: bookingId }, data: { transfer_id: transfer.id } });
        await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_payout', provider: 'stripe', reference_number: transfer.id, order_id: bookingId, status: 'succeeded', amount: toPay, currency } });
        return transfer.id;
      } catch (e) {
        this.logger.error(`transfer for ${bookingId} failed; crediting balance instead`, e);
      }
    }
    // no Connect account (or transfer failed): the money waits in the vendor's Vendly balance
    await this.prisma.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: toPay } } });
    await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_earning', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: toPay, currency } });
    return 'balance';
  }

  private async recordRecovery(vendorId: string, bookingId: string, amount: number, currency: string) {
    await this.prisma.user.update({ where: { id: vendorId }, data: { balance: { increment: amount } } });
    await this.prisma.paymentTransaction.create({ data: { user_id: vendorId, type: 'payout_recovery', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount, currency } });
  }

  // ─── Rental security deposit ──────────────────────────────────────────────

  /**
   * Called when a rental is returned. No fees: the hold is voided. Fees: captured from the hold
   * (partial capture), and anything above the hold is charged to the saved card as an extra.
   */
  async settleSecurityDeposit(bookingId: string, fees: number) {
    return withBookingLock(this.prisma, bookingId, () => this.settleSecurityDepositLocked(bookingId, fees));
  }

  private async settleSecurityDepositLocked(bookingId: string, fees: number) {
    fees = round2(Math.max(0, fees));
    const hold = await this.prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId, kind: SECURITY_DEPOSIT } });
    let captured = 0;
    if (hold?.status === InstallmentStatus.PROCESSING && hold.payment_intent_id) {
      const take = round2(Math.min(fees, Number(hold.amount)));
      if (take > 0) {
        try {
          await StripePayment.capturePaymentIntent(hold.payment_intent_id, `deposit-${hold.id}`, take);
          await this.prisma.bookingInstallment.update({ where: { id: hold.id }, data: { amount: take, label: 'Security deposit (kept for fees)' } });
          await this.markPaid(hold.id, hold.payment_intent_id, false);
          captured = take;
        } catch (e: any) {
          // the hold may have lapsed; fall through and charge the card instead
          this.logger.error(`deposit capture ${hold.id}`, e);
          await this.prisma.bookingInstallment.update({ where: { id: hold.id }, data: { status: InstallmentStatus.CANCELLED, last_error: e?.raw?.message ?? e?.message ?? 'Capture failed' } });
        }
      } else {
        await StripePayment.cancelPaymentIntent(hold.payment_intent_id).catch((e) => this.logger.error(`void deposit ${hold.id}`, e));
        await this.prisma.bookingInstallment.update({ where: { id: hold.id }, data: { status: InstallmentStatus.CANCELLED } });
      }
    } else if (hold && (hold.status === InstallmentStatus.SCHEDULED || hold.status === InstallmentStatus.FAILED)) {
      await this.prisma.bookingInstallment.update({ where: { id: hold.id }, data: { status: InstallmentStatus.CANCELLED } });
    }

    // Fees above the hold the customer agreed to aren't charged on the vendor's word: they go to the
    // customer as a fee to approve, like any other fee (unanswered or declined, the vendor can ask
    // Vendly to review it).
    const extra = round2(fees - captured);
    let feeRequest: string | null = null;
    if (extra > 0) {
      const row = await this.prisma.bookingExtra.create({
        data: { booking_id: bookingId, kind: AddOnKind.FEE, name: 'Damage and late fees (above the deposit)', unit_price: extra, quantity: 1, amount: extra, fee_amount: 0, note: captured > 0 ? `After ${money(captured)} kept from the security deposit` : null, status: BookingExtraStatus.PENDING },
      });
      feeRequest = row.id;
    }
    return { captured_from_deposit: captured, charged_extra: 0, awaiting_approval: extra, deposit_released: !!hold && captured === 0, fee_request_id: feeRequest };
  }

  // ─── Early deposit release ────────────────────────────────────────────────

  /**
   * Vendors can take a paid deposit before the event (to buy supplies). The amount comes off the
   * final payout; if the booking is later refunded, it is recovered from future payouts.
   */
  async releaseDepositEarly(bookingId: string, vendorId: string) {
    return withBookingLock(this.prisma, bookingId, () => this.releaseDepositEarlyLocked(bookingId, vendorId));
  }

  private async releaseDepositEarlyLocked(bookingId: string, vendorId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { vendor_id: true, status: true, currency: true, payment_plan: true, early_released_amount: true, dispute_opened_at: true, dispute_resolved_at: true, vendor: { select: { stripe_connect_id: true, balance: true } }, installments: { orderBy: { sequence: 'asc' } }, contracts: { where: { status: 'EXECUTED' }, select: { id: true }, take: 1 } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (!([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] as BookingStatus[]).includes(b.status)) throw new BadRequestException('Deposits can be released once the booking is confirmed.');
    if (!b.contracts.length) throw new BadRequestException('The contract must be signed by both sides first.');
    if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute.');
    if (Number(b.early_released_amount ?? 0) > 0) throw new BadRequestException('The deposit for this booking was already released.');
    // money already owed to Vendly (from an earlier refund) is settled before another deposit goes out early
    if (Number(b.vendor.balance ?? 0) < 0) throw new BadRequestException(EARLY_RELEASE_OWING);
    // only a deposit plan has a deposit: its first charge, with the balance still to come
    const charges = b.installments.filter((i) => i.kind === 'charge');
    const deposit = charges[0];
    const depositPlan = b.payment_plan === PaymentPlan.DEPOSIT_50 || b.payment_plan === PaymentPlan.DEPOSIT_25;
    if (deposit && isClearing(deposit)) throw new BadRequestException(`The customer’s bank payment for the deposit is still clearing (${BANK_CLEARING_TEXT}). You can release it once it has.`);
    if (!depositPlan || !deposit || charges.length < 2 || deposit.status !== InstallmentStatus.PAID) throw new BadRequestException('There is no paid deposit to release on this booking.');
    if (!b.vendor.stripe_connect_id) throw new BadRequestException('Connect a bank account in Payments & Payouts first.');
    const amount = round2(Number(deposit.amount) - Number(deposit.fee_amount) - Number(deposit.refunded_amount));
    if (amount <= 0) throw new BadRequestException('There is no deposit left to release.');

    const claimed = await this.prisma.booking.updateMany({ where: { id: bookingId, early_released_amount: 0 }, data: { early_released_amount: amount } });
    if (claimed.count !== 1) throw new BadRequestException('The deposit for this booking was already released.');
    const currency = b.currency ?? 'usd';
    try {
      const transfer = await StripePayment.transferForBooking({ amount, currency, accountId: b.vendor.stripe_connect_id, bookingId, idempotencyKey: `early-${bookingId}` });
      await this.prisma.paymentTransaction.create({ data: { user_id: vendorId, type: 'deposit_early_release', provider: 'stripe', reference_number: transfer.id, order_id: bookingId, status: 'succeeded', amount, currency } });
      return { success: true, data: { amount, transfer_id: transfer.id } };
    } catch (e: any) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { early_released_amount: 0 } });
      throw new BadRequestException(e?.raw?.message ?? 'The transfer could not be made. Try again later.');
    }
  }

  // ─── Vendor gives money back ─────────────────────────────────────────────

  /**
   * The vendor gives the customer money off (a late start, a smaller order). It comes out of the
   * vendor's part only: first by lowering what the customer still has to pay, then as a refund of
   * what they paid, newest payment first. The Vendly Protection fee is unchanged. If the vendor was
   * already paid for that money, it is taken back from their balance (less the commission Vendly took on it).
   */
  async giveBack(bookingId: string, vendorId: string, input: { amount: number; reason: string }) {
    const amount = round2(Number(input.amount));
    if (!(amount > 0)) throw new BadRequestException('Enter an amount to give back.');
    const result = await withBookingLock(this.prisma, bookingId, async () => {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, vendor_id: true, customer_id: true, status: true, currency: true, released_at: true, commission_amount: true, released_gross: true, dispute_opened_at: true, dispute_resolved_at: true, installments: true },
      });
      if (!b) throw new NotFoundException('Booking not found');
      if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
      if (!([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] as BookingStatus[]).includes(b.status)) {
        throw new BadRequestException('You can give money back once the booking is confirmed.');
      }
      if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute. Vendly will settle the money when it is resolved.');

      // what the customer hasn't paid yet: scheduled or failed charges, and card holds not captured yet
      const unpaid = b.installments
        .filter((i) => i.kind !== SECURITY_DEPOSIT && (i.status === InstallmentStatus.SCHEDULED || i.status === InstallmentStatus.FAILED || (i.status === InstallmentStatus.PROCESSING && i.capture_manually)))
        .sort((x, y) => y.sequence - x.sequence);
      const lowerable = round2(unpaid.reduce((s, i) => s + Math.max(0, Number(i.amount) - Number(i.fee_amount)), 0));
      const paid = b.installments.filter((i) => i.status === InstallmentStatus.PAID);
      const notPaidOut = round2(paid.filter((i) => !i.paid_out_at).reduce((s, i) => s + vendorPortion(i), 0));
      const paidOut = round2(paid.filter((i) => i.paid_out_at).reduce((s, i) => s + vendorPortion(i), 0));
      // Money already sent to the vendor is refunded only as far as their Vendly balance covers taking
      // it back (less the commission Vendly took on it); otherwise Vendly would be paying the refund.
      const rate = Number(b.released_gross ?? 0) > 0 ? Number(b.commission_amount ?? 0) / Number(b.released_gross) : currentFees().commission / 100;
      const vendor = paidOut > 0 ? await this.prisma.user.findUnique({ where: { id: b.vendor_id }, select: { balance: true } }) : null;
      const covered = paidOut > 0 ? Math.min(paidOut, Math.floor((Math.max(0, Number(vendor?.balance ?? 0)) / Math.max(1 - rate, 0.01)) * 100) / 100) : 0;
      const max = round2(lowerable + notPaidOut + covered);
      if (max <= 0) {
        throw new BadRequestException(
          paidOut > 0 ? GIVE_BACK_PAID_OUT : 'There is nothing paid or due on this booking to give back.',
        );
      }
      if (amount > max) {
        throw new BadRequestException(`You can give back up to $${max.toFixed(2)} on this booking.${covered < paidOut ? ` ${GIVE_BACK_PAID_OUT}` : ''}`);
      }

      let remaining = amount;
      let lowered = 0;
      for (const i of unpaid) {
        if (remaining <= 0) break;
        let take = round2(Math.min(remaining, Math.max(0, Number(i.amount) - Number(i.fee_amount))));
        let left = round2(Number(i.amount) - take);
        // Stripe can't charge under $0.50: leave at least that, or nothing at all
        if (left > 0 && left < MIN_CHARGE) {
          take = round2(Number(i.amount) - MIN_CHARGE);
          left = MIN_CHARGE;
        }
        if (take <= 0) continue;
        // only while it is still unpaid; a charge that started meanwhile is refunded below instead
        const done = await this.prisma.bookingInstallment.updateMany({
          where: { id: i.id, status: i.status, amount: i.amount },
          data: left > 0 ? { amount: left } : { amount: 0, status: InstallmentStatus.CANCELLED },
        });
        if (done.count !== 1) continue;
        // nothing left to collect: let go of the card hold too
        if (left <= 0 && i.status === InstallmentStatus.PROCESSING && i.payment_intent_id) {
          await StripePayment.cancelPaymentIntent(i.payment_intent_id).catch((e) => this.logger.error(`void hold ${i.id}`, e));
        }
        remaining = round2(remaining - take);
        lowered = round2(lowered + take);
      }

      let refunded = 0;
      let recovered = 0;
      if (remaining > 0) {
        // keyed on each installment's refund state: a retry after a half-finished attempt never repeats a recorded refund
        // money Vendly still holds is refunded first, so what comes from paid-out money stays within the cover above
        const parts = await this.refundParts(bookingId, remaining, 'giveback', { keepFees: true, stateKey: true, heldFirst: true });
        refunded = round2(parts.reduce((s, p) => s + p.amount, 0));
        // money the vendor was already paid comes back from their balance, less Vendly's commission on it
        const fromPaidOut = parts.filter((p) => p.paid_out).reduce((s, p) => s + p.amount, 0);
        recovered = round2(fromPaidOut * (1 - rate));
        const commissionBack = round2(fromPaidOut - recovered);
        const currency = b.currency ?? 'usd';
        if (recovered > 0) await this.recordRecovery(b.vendor_id, bookingId, -recovered, currency);
        if (commissionBack > 0) {
          await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'vendly_commission', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: -commissionBack, currency } });
        }
      }
      const given = round2(lowered + refunded);
      if (given <= 0) throw new BadRequestException('The money could not be given back right now. Please try again.');
      await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'vendor_give_back', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: given, currency: b.currency ?? 'usd' } });
      return { customer_id: b.customer_id, amount: given, lowered, refunded, recovered_from_balance: recovered };
    });

    const info = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { listing: { select: { title: true } }, customer: { select: { email: true, name: true } }, vendor: { select: { name: true, vendorProfile: { select: { business_name: true } } } } } });
    const title = info?.listing?.title ?? 'your booking';
    const who = info?.vendor?.vendorProfile?.business_name || info?.vendor?.name || 'Your vendor';
    const how = result.refunded > 0 && result.lowered > 0
      ? `$${result.lowered.toFixed(2)} comes off what you still owe and $${result.refunded.toFixed(2)} is refunded to your card (it can take 5 to 10 days to show).`
      : result.refunded > 0
        ? `It is refunded to your card and can take 5 to 10 days to show.`
        : `It comes off what you still owe.`;
    const body = `${who} gave you $${result.amount.toFixed(2)} back on ${title}: ${input.reason.trim()}. ${how}`;
    if (info?.customer?.email) {
      await this.mail.sendBookingNotification({ to: info.customer.email, recipientName: info.customer.name ?? '', subject: `Money back on ${title}`, message: body, status: 'REFUND', listingTitle: title, amount: result.amount, ctaUrl: `${appConfig().app.client_app_url}/bookings/${bookingId}` }).catch(() => null);
    }
    void this.push.sendToUser(result.customer_id, { title: 'Money back from your vendor', body, data: { type: 'booking', bookingId } }, 'payments');
    track('vendor_gave_back', vendorId, { booking_id: bookingId, amount: result.amount, refunded: result.refunded, lowered: result.lowered });
    const { customer_id: _c, ...data } = result;
    return { success: true, data };
  }

  // ─── Extras paid after the payout ────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  cronLatePayouts() {
    return withJobLock(this.prisma, 'late-payouts', () => this.payOutLateInstallments());
  }

  /** Pays vendors for add-ons and fees the customer paid after the booking itself was paid out. */
  async payOutLateInstallments() {
    const due = await this.prisma.bookingInstallment.findMany({
      where: { status: InstallmentStatus.PAID, paid_out_at: null, booking: { status: BookingStatus.COMPLETED, released_at: { not: null }, OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }] } },
      select: { booking_id: true },
      distinct: ['booking_id'],
      take: 100,
    });
    for (const d of due)
      await this.payOutLateFor(d.booking_id).catch((e) => {
        this.logger.error(`late payout ${d.booking_id}`, e);
        Sentry.captureException(e, { tags: { job: 'late-payouts' }, extra: { booking_id: d.booking_id } });
      });
    return due.length;
  }

  /** Pays out one booking's late extras now (also called right after one is paid). */
  async payOutLateFor(bookingId: string) {
    return withBookingLock(this.prisma, bookingId, async () => {
      const b = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, released_at: true, vendor_id: true, currency: true, commission_amount: true, released_gross: true, dispute_opened_at: true, dispute_resolved_at: true, dispute_resolution: true, vendor: { select: { stripe_connect_id: true, balance: true } } },
      });
      if (!b || b.status !== BookingStatus.COMPLETED || !b.released_at || this.bookingEnded(b)) return null;
      if (b.dispute_opened_at && !b.dispute_resolved_at) return null;
      const insts = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, status: InstallmentStatus.PAID, paid_out_at: null } });
      if (!insts.length) return null;
      // under the booking lock nothing else pays these out, so marking them first is enough
      await this.prisma.bookingInstallment.updateMany({ where: { id: { in: insts.map((i) => i.id) }, paid_out_at: null }, data: { paid_out_at: new Date() } });
      const gross = round2(insts.reduce((s, i) => s + vendorPortion(i), 0));
      // the same commission rate as the booking's own payout
      const rate = Number(b.released_gross ?? 0) > 0 ? Number(b.commission_amount ?? 0) / Number(b.released_gross) : currentFees().commission / 100;
      const commission = round2(gross * rate);
      const share = round2(gross - commission);
      const currency = b.currency ?? 'usd';
      if (commission > 0) {
        await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'vendly_commission', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: commission, currency } });
      }
      if (share <= 0) return null;
      const owed = Math.max(0, -Number(b.vendor.balance ?? 0));
      const offset = round2(Math.min(owed, share));
      const toPay = round2(share - offset);
      if (offset > 0) {
        await this.prisma.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: offset } } });
        await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'payout_recovery_settled', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: offset, currency } });
      }
      if (toPay <= 0) return 'recovered';
      if (b.vendor.stripe_connect_id) {
        try {
          const key = `extras-${insts.map((i) => i.id).sort().join('-')}`.slice(0, 250);
          const transfer = await StripePayment.transferForBooking({ amount: toPay, currency, accountId: b.vendor.stripe_connect_id, bookingId, idempotencyKey: key });
          await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_payout', provider: 'stripe', reference_number: transfer.id, order_id: bookingId, status: 'succeeded', amount: toPay, currency } });
          return transfer.id;
        } catch (e) {
          this.logger.error(`extras transfer for ${bookingId} failed; crediting balance instead`, e);
        }
      }
      await this.prisma.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: toPay } } });
      await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_earning', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount: toPay, currency } });
      return 'balance';
    });
  }

  // ─── Disputes (admin) ────────────────────────────────────────────────────

  async listDisputes(status: 'open' | 'resolved' = 'open', adminId = 'admin') {
    const rows = await this.prisma.booking.findMany({
      where: status === 'open' ? { dispute_opened_at: { not: null }, dispute_resolved_at: null } : { dispute_resolved_at: { not: null } },
      orderBy: { dispute_opened_at: 'asc' },
      select: {
        id: true, status: true, amount: true, service_fee: true, currency: true, dispute_opened_at: true, dispute_reason: true, dispute_resolved_at: true, dispute_resolution: true, released_at: true, completed_at: true,
        paid_at: true, payment_transaction_id: true,
        dispute_vendor_reply: true, dispute_vendor_replied_at: true,
        dispute_category: true, dispute_outcome: true, dispute_requested_amount: true, dispute_photos: true, request_photos: true,
        listing: { select: { title: true } },
        customer: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true, email: true } },
        installments: { select: { kind: true, status: true, amount: true, fee_amount: true, refunded_amount: true } },
        proofs: { select: { id: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 1 },
      },
      take: 200,
    });
    // a booking paid in one go through Checkout has no installment for that payment
    const checkouts = await Promise.all(rows.map((r) => this.checkoutPart(r.id, r)));
    return {
      success: true,
      data: rows.map(({ dispute_photos, request_photos, payment_transaction_id: _p, ...r }, i) => ({
        ...r,
        dispute_requested_amount: r.dispute_requested_amount != null ? Number(r.dispute_requested_amount) : null,
        dispute_ask: describeDisputeAsk({ category: r.dispute_category, outcome: r.dispute_outcome, requested_amount: r.dispute_requested_amount }),
        // signed, expiring links; the stored keys never leave the API
        dispute_photo_urls: disputePhotoUrls(dispute_photos, adminId, r.id),
        // what the customer showed the vendor when they asked for the booking
        request_photo_urls: requestPhotoUrls(request_photos, adminId, r.id),
        paid: round2(r.installments.filter((i) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0) + (checkouts[i]?.paid ?? 0)),
        // a partial refund must stay under this (the Vendly Protection fee goes back only with a full refund)
        vendor_paid: round2(r.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + vendorPortion(i), 0) + (checkouts[i]?.vendorPaid ?? 0)),
        has_proof: r.proofs.length > 0,
      })),
    };
  }

  /**
   * Admin decision on a dispute. refund: everything back to the customer (fee included), nothing to
   * the vendor. partial_refund: `amount` back to the customer, the rest released. release: vendor paid in full.
   * A one-off Checkout payment is refunded like the installments. On a booking that isn't complete
   * yet (a reported no-show) the rest is paid out once the vendor marks it complete; a full refund
   * of a booking that was never started cancels it.
   */
  async resolveDispute(bookingId: string, adminId: string, input: { action: 'refund' | 'partial_refund' | 'release'; amount?: number; note: string }) {
    const res = await withBookingLock(this.prisma, bookingId, () => this.settleDisputeLocked(bookingId, adminId, input));
    // outside the lock: releaseBooking takes it itself
    if (res.releaseNow) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { release_at: new Date() } });
      await this.releaseBooking(bookingId);
    }
    return { success: true, data: { refunded: res.refunded, action: input.action } };
  }

  private async settleDisputeLocked(bookingId: string, adminId: string, input: { action: 'refund' | 'partial_refund' | 'release'; amount?: number; note: string }) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true, status: true, dispute_opened_at: true, dispute_resolved_at: true, released_at: true, vendor_id: true, customer_id: true, currency: true, early_released_amount: true,
        amount: true, service_fee: true, paid_at: true, payment_transaction_id: true,
        listing: { select: { title: true } }, customer: { select: { email: true, name: true } }, vendor: { select: { email: true, name: true } }, installments: true,
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (!b.dispute_opened_at || b.dispute_resolved_at) throw new BadRequestException('This booking has no open dispute.');
    if (b.released_at) throw new BadRequestException('Payment for this booking was already released.');
    const paid = round2(b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0));
    // paid in one go through Checkout (no installment for it): refunded from that payment
    const checkout = await this.checkoutPart(bookingId, b);
    // a partial refund comes out of the vendor's part; the Vendly Protection fee goes back only with a full refund
    const vendorPaid = round2(b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + vendorPortion(i), 0) + (checkout?.vendorPaid ?? 0));
    const key = `dispute-${bookingId}`;

    let refunded = 0;
    if (input.action === 'refund') {
      // the Checkout refund first: if Stripe refuses it nothing else has moved and the admin can try again
      if (checkout) refunded = await this.refundCheckout(b, checkout.paid, key);
      refunded = round2(refunded + (await this.refundBooking(bookingId, paid, key)));
      // nothing more is charged on a fully refunded booking
      await this.prisma.bookingExtra.updateMany({ where: { booking_id: bookingId, status: { in: [BookingExtraStatus.PENDING, BookingExtraStatus.IN_REVIEW] } }, data: { status: BookingExtraStatus.CANCELLED } });
    } else if (input.action === 'partial_refund') {
      const amt = round2(Number(input.amount ?? 0));
      if (amt <= 0 || amt >= vendorPaid) throw new BadRequestException(`A partial refund must be more than $0 and less than $${vendorPaid.toFixed(2)} (the vendor's part of what was paid).`);
      if (checkout) refunded = await this.refundCheckout(b, round2(Math.min(amt, checkout.vendorPaid)), key);
      if (amt > refunded) refunded = round2(refunded + (await this.refundBooking(bookingId, round2(amt - refunded), key, { keepFees: true })));
    }
    const note = `${input.action}${refunded ? ` ($${refunded.toFixed(2)} refunded)` : ''} by admin ${adminId}: ${input.note}`;
    await this.prisma.booking.update({ where: { id: bookingId }, data: { dispute_resolved_at: new Date(), dispute_resolution: note } });

    if (input.action === 'refund') {
      // vendor gets nothing; anything paid out early is owed back
      const early = Number(b.early_released_amount ?? 0);
      const now = new Date();
      await this.prisma.booking.update({ where: { id: bookingId }, data: { released_at: now, payout_credited_at: now } });
      if (early > 0) await this.recordRecovery(b.vendor_id, bookingId, -early, b.currency ?? 'usd');
      // a booking the vendor never started (a no-show) is over: it leaves the vendor's upcoming work
      if (b.status === BookingStatus.CONFIRMED) {
        const cancelled = await this.prisma.booking.updateMany({ where: { id: bookingId, status: BookingStatus.CONFIRMED }, data: { status: BookingStatus.CANCELLED, cancelled_at: now, cancel_reason: 'Refunded in full by Vendly after a reported problem', cancelled_by: 'ADMIN', payment_due_by: null, payment_due_kind: null } });
        // as any cancellation: nothing more is charged and card holds are let go (also one that came
        // back open after the refund above, such as a charge in flight that then failed)
        if (cancelled.count === 1) await this.voidOpenCharges(bookingId).catch((e) => this.logger.error(`void charges ${bookingId}`, e));
      }
    }

    const title = b.listing?.title ?? 'your booking';
    // not complete yet: what isn't refunded is paid out once the vendor marks the booking complete
    const later = b.status !== BookingStatus.COMPLETED ? ' The vendor is paid once they mark the booking complete.' : '';
    const message =
      input.action === 'release'
        ? later
          ? `Vendly reviewed the problem reported on ${title} and decided for the vendor.${later} ${input.note}`
          : `Vendly reviewed the problem reported on ${title} and released the payment to the vendor. ${input.note}`
        : `Vendly reviewed the problem reported on ${title} and refunded $${refunded.toFixed(2)} to the customer.${input.action === 'partial_refund' ? later : ''} ${input.note}`;
    for (const who of [b.customer, b.vendor]) {
      if (who?.email) await this.mail.sendBookingNotification({ to: who.email, recipientName: who.name ?? '', subject: `Dispute resolved — ${title}`, message, status: 'DISPUTE_RESOLVED', listingTitle: title }).catch(() => null);
    }
    track('dispute_resolved', adminId, { booking_id: bookingId, action: input.action, refunded });
    return { refunded, releaseNow: input.action !== 'refund' && b.status === BookingStatus.COMPLETED };
  }

  // ─── Receipts and the final invoice ──────────────────────────────────────

  /** "Visa •••• 4242" for a saved card ("Bank account •••• 6789" for a bank account), or null when it isn't known. Never throws. */
  async cardLabel(paymentMethodId?: string | null): Promise<string | null> {
    if (!paymentMethodId) return null;
    try {
      const pm = await StripePayment.retrievePaymentMethod(paymentMethodId);
      if (pm?.us_bank_account) return bankText(pm.us_bank_account);
      return cardText(pm?.card);
    } catch {
      return null;
    }
  }

  /**
   * Emails the customer a receipt for one paid installment (deposit, balance, captured hold, add-on or
   * fee, rental deposit kept for fees), once: `receipt_sent_at` is claimed first. Never throws, so a
   * mail problem can't affect the payment it describes.
   */
  async sendReceipt(installmentId: string): Promise<boolean> {
    const claimedAt = new Date();
    let claimedIt = false;
    try {
      const claimed = await this.prisma.bookingInstallment.updateMany({
        where: { id: installmentId, status: InstallmentStatus.PAID, receipt_sent_at: null },
        data: { receipt_sent_at: claimedAt },
      });
      if (claimed?.count !== 1) return false;
      claimedIt = true;
      const i = await this.prisma.bookingInstallment.findUniqueOrThrow({
        where: { id: installmentId },
        select: {
          label: true, amount: true, currency: true, paid_at: true, payment_method_type: true,
          booking: { select: { id: true, status: true, dispute_resolution: true, payment_method_id: true, listing: { select: { title: true } }, rental_reservations: { select: { item: { select: { title: true } } } }, customer: { select: { email: true, name: true } } } },
        },
      });
      const b = i?.booking;
      // a charge on a booking that already ended is handed straight back (undoIfBookingEnded): no receipt
      if (!b?.customer?.email || this.bookingEnded(b)) return false;
      const title = bookingTitle(b);
      const card = await this.cardLabel(b.payment_method_id);
      const amount = money(i.amount, i.currency);
      const queued = await this.mail.sendBookingNotification({
        to: b.customer.email,
        recipientName: b.customer.name ?? '',
        subject: `Receipt — ${title}`,
        message: `Thanks for your payment. We charged ${amount}${card ? ` to your ${card}` : ''} for ${title} (${i.label}).`,
        status: 'RECEIPT',
        listingTitle: title,
        lines: [
          { label: 'Charged for', value: i.label },
          { label: 'Amount', value: amount },
          ...(card ? [{ label: isBank(i.payment_method_type) ? 'Bank account' : 'Card', value: card }] : []),
          { label: 'Date', value: shortDate(i.paid_at ?? new Date()) },
          { label: 'Booking reference', value: b.id },
        ],
        ctaUrl: `${appConfig().app.client_app_url}/bookings/${b.id}`,
      });
      if (queued === false) throw new Error('The receipt email could not be queued');
      return true;
    } catch (e) {
      this.logger.error(`receipt for ${installmentId}`, e as Error);
      // let go of the claim so the hourly sweep tries again
      if (claimedIt) {
        await this.prisma.bookingInstallment
          .updateMany({ where: { id: installmentId, receipt_sent_at: claimedAt }, data: { receipt_sent_at: null } })
          .catch((err) => this.logger.error(`receipt claim for ${installmentId}`, err as Error));
      }
      return false;
    }
  }

  /**
   * Emails the customer that their final invoice is ready once the booking's money is final (the
   * vendor was paid out, or a cancellation was settled), once: `invoice_sent_at` is claimed first.
   * The email links to the booking, where the PDF is downloaded (GET /bookings/:id/invoice). Never throws.
   */
  async sendFinalInvoice(bookingId: string): Promise<boolean> {
    const claimedAt = new Date();
    let claimedIt = false;
    try {
      const claimed = await this.prisma.booking.updateMany({
        where: { id: bookingId, invoice_sent_at: null, paid_at: { not: null }, OR: [{ released_at: { not: null } }, { status: BookingStatus.CANCELLED }] },
        data: { invoice_sent_at: claimedAt },
      });
      if (claimed?.count !== 1) return false;
      claimedIt = true;
      const b = await this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { id: true, status: true, currency: true, listing: { select: { title: true } }, rental_reservations: { select: { item: { select: { title: true } } } }, customer: { select: { email: true, name: true } }, installments: { select: { status: true, amount: true, refunded_amount: true } } },
      });
      if (!b?.customer?.email) return false;
      const title = bookingTitle(b);
      const paid = b.installments.filter(isPaid);
      const charged = round2(paid.reduce((s, i) => s + Number(i.amount), 0));
      const refunded = round2(paid.reduce((s, i) => s + Number(i.refunded_amount), 0));
      const lines = paid.length
        ? [
            { label: 'Total charged', value: money(charged, b.currency) },
            ...(refunded > 0 ? [{ label: 'Refunded', value: money(refunded, b.currency) }] : []),
            { label: 'Total paid', value: money(charged - refunded, b.currency) },
          ]
        : [];
      const queued = await this.mail.sendBookingNotification({
        to: b.customer.email,
        recipientName: b.customer.name ?? '',
        subject: `Your invoice — ${title}`,
        message: `${b.status === BookingStatus.CANCELLED ? 'Your cancelled booking has been settled.' : 'Your booking is complete and fully settled.'} Your final invoice lists the package, add-ons, fees, every charge and refund. Download it from the booking.`,
        status: 'INVOICE',
        listingTitle: title,
        lines,
        ctaUrl: `${appConfig().app.client_app_url}/bookings/${b.id}`,
        ctaLabel: 'Download invoice',
      });
      if (queued === false) throw new Error('The invoice email could not be queued');
      return true;
    } catch (e) {
      this.logger.error(`invoice email for ${bookingId}`, e as Error);
      // let go of the claim so the hourly sweep tries again
      if (claimedIt) {
        await this.prisma.booking
          .updateMany({ where: { id: bookingId, invoice_sent_at: claimedAt }, data: { invoice_sent_at: null } })
          .catch((err) => this.logger.error(`invoice claim for ${bookingId}`, err as Error));
      }
      return false;
    }
  }

  /** Hourly: receipts and invoices whose email was missed (a crash between the payment and the email). */
  @Cron(CronExpression.EVERY_HOUR)
  cronReceipts() {
    return withJobLock(this.prisma, 'receipts', () => this.runReceiptSweep());
  }

  async runReceiptSweep(now = new Date()) {
    // only recent ones: older payments were backfilled as sent and must not be emailed now
    const since = new Date(now.getTime() - 7 * DAY);
    const receipts = await this.prisma.bookingInstallment.findMany({
      where: { status: InstallmentStatus.PAID, receipt_sent_at: null, paid_at: { gte: since } },
      select: { id: true },
      take: 200,
    });
    for (const r of receipts) await this.sendReceipt(r.id);
    const invoices = await this.prisma.booking.findMany({
      where: {
        invoice_sent_at: null,
        paid_at: { not: null },
        OR: [{ released_at: { gte: since } }, { status: BookingStatus.CANCELLED, cancelled_at: { gte: since } }],
      },
      select: { id: true },
      take: 200,
    });
    for (const b of invoices) await this.sendFinalInvoice(b.id);
    return { receipts: receipts.length, invoices: invoices.length };
  }

  // ─── Money that stopped half-way (report only) ───────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  cronMoneyCheck() {
    return withJobLock(this.prisma, 'money-check', async () => {
      const res = await this.runMoneyCheck();
      // under the same lock: each booking is flagged by one server only
      await this.flagNotStarted().catch((e) => {
        this.logger.error('not-started check', e);
        Sentry.captureException(e, { tags: { job: 'not-started' } });
      });
      return res;
    });
  }

  /**
   * Confirmed bookings the vendor still hasn't started 2 hours after their start time (maybe a
   * no-show): the vendor is asked to start or sort it out with the customer, and Vendly's admins
   * hear about it. Each booking falls in exactly one hourly window, so it is flagged once. Rentals
   * are left out: they can stay confirmed until the items come back.
   */
  async flagNotStarted(now = new Date()) {
    const window = notStartedWindow(now);
    const rows = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        deleted_at: null,
        // a reported problem already reached the vendor and Vendly
        dispute_opened_at: null,
        rental_reservations: { none: {} },
        OR: [{ event_start_at: window }, { event_start_at: null, scheduled_at: window }],
      },
      select: { id: true, vendor_id: true, listing: { select: { title: true } }, customer: { select: { name: true } }, vendor: { select: { email: true, name: true } } },
      orderBy: { id: 'asc' },
      take: 500,
    });
    if (!rows.length) return [];
    const clientUrl = appConfig().app.client_app_url;
    for (const b of rows) {
      const title = b.listing?.title ?? 'a booking';
      const body = `${title} for ${b.customer?.name ?? 'your customer'} was due to start ${NOT_STARTED_FLAG_HOURS} hours ago and hasn’t been started. If you’re on it, tap Start work. If you can’t make it, message the customer now: they can report a problem to Vendly.`;
      void this.push.sendToUser(b.vendor_id, { title: 'Booking not started', body, data: { type: 'booking', bookingId: b.id } }, 'booking_updates');
      if (b.vendor?.email) {
        await this.mail
          .sendBookingNotification({ to: b.vendor.email, recipientName: b.vendor.name ?? '', subject: `Not started yet — ${title}`, message: body, status: 'CONFIRMED', listingTitle: title, ctaUrl: `${clientUrl}/vendor/bookings/${b.id}`, topic: 'booking_updates' })
          .catch(() => null);
      }
    }
    const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true } });
    const list = rows.map((b) => `${b.listing?.title ?? 'Booking'} (${b.id})`).join(', ');
    const body = `${rows.length === 1 ? 'A confirmed booking was' : `${rows.length} confirmed bookings were`} not started ${NOT_STARTED_FLAG_HOURS} hours after the start time: ${list}. The vendors were asked to start or contact the customer.`;
    for (const a of admins) void this.push.sendToUser(a.id, { title: 'Bookings not started', body: body.slice(0, 1000), data: { type: 'not_started' } });
    return rows.map((b) => b.id);
  }

  /**
   * Finds bookings whose money stopped half-way, e.g. a server crash between marking a booking
   * released and paying the vendor: released bookings that owe the vendor something but have no
   * payout or earning record, and cancelled paid bookings with neither a refund record nor the
   * vendor's share settled. Reports them to Sentry and Vendly's admins; never moves money itself.
   * Looks at what changed one to two hours ago (later work has had time to finish; each booking is
   * looked at about once).
   */
  async runMoneyCheck(now = new Date()) {
    const window = { gte: new Date(now.getTime() - 2 * HOUR - 5 * 60_000), lt: new Date(now.getTime() - HOUR) };
    const [released, cancelled] = await Promise.all([
      this.prisma.booking.findMany({
        where: { status: BookingStatus.COMPLETED, released_at: window, released_gross: { gt: 0 } },
        select: { id: true, released_gross: true, commission_amount: true, early_released_amount: true },
        take: 500,
      }),
      this.prisma.booking.findMany({ where: { status: BookingStatus.CANCELLED, paid_at: { not: null }, cancelled_at: window, payout_credited_at: null }, select: { id: true }, take: 500 }),
    ]);
    // the vendor was owed something: the payout (or what it paid back) leaves a record
    const owed = released.filter((b) => round2(Number(b.released_gross ?? 0) - Number(b.commission_amount ?? 0) - Number(b.early_released_amount ?? 0)) > 0);
    const ids = [...owed.map((b) => b.id), ...cancelled.map((b) => b.id)];
    if (!ids.length) return { unpaid_releases: [], unsettled_cancellations: [] };
    const records = await this.prisma.paymentTransaction.findMany({
      where: {
        type: { in: ['booking_payout', 'booking_earning', 'payout_recovery_settled', 'booking_refund'] },
        OR: [{ order_id: { in: ids } }, { reference_number: { in: ids } }],
      },
      select: { type: true, order_id: true, reference_number: true },
    });
    const has = (id: string, types: string[]) => records.some((r) => types.includes(r.type) && (r.order_id === id || r.reference_number === id));
    const unpaidReleases = owed.filter((b) => !has(b.id, ['booking_payout', 'booking_earning', 'payout_recovery_settled'])).map((b) => b.id);
    const unsettledCancellations = cancelled.filter((b) => !has(b.id, ['booking_refund'])).map((b) => b.id);
    if (unpaidReleases.length || unsettledCancellations.length) {
      const lines = [
        ...(unpaidReleases.length ? [`Released without a payout or earning record: ${unpaidReleases.join(', ')}`] : []),
        ...(unsettledCancellations.length ? [`Cancelled after payment without a refund record or vendor settlement: ${unsettledCancellations.join(', ')}`] : []),
      ];
      this.logger.error(`Money check: ${lines.join(' | ')}`);
      Sentry.captureMessage('Bookings with unfinished money', { level: 'error', tags: { job: 'money-check' }, extra: { unpaid_releases: unpaidReleases, unsettled_cancellations: unsettledCancellations } });
      const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true, email: true, name: true } });
      const body = `${lines.join('. ')}. Nothing was moved automatically: check these bookings in Stripe and settle them by hand.`;
      for (const a of admins) {
        void this.push.sendToUser(a.id, { title: 'Bookings need a money check', body, data: { type: 'money_check' } });
        if (a.email) {
          await this.mail
            .sendBookingNotification({ to: a.email, recipientName: a.name ?? '', subject: 'Bookings need a money check', message: body, status: 'MONEY_CHECK', listingTitle: 'Vendly payments', ctaUrl: `${appConfig().app.client_app_url}/admin` })
            .catch(() => null);
        }
      }
    }
    return { unpaid_releases: unpaidReleases, unsettled_cancellations: unsettledCancellations };
  }

  // ─── Vendor earnings (read-only) ─────────────────────────────────────────

  /** A vendor's real earnings: released, held, Vendly commission taken and money given back. */
  async vendorEarningsSummary(vendorId: string) {
    const [bookings, givenBack, vendor] = await Promise.all([
      this.prisma.booking.findMany({
        where: { vendor_id: vendorId },
        select: { id: true, status: true, amount: true, paid_at: true, released_at: true, payout_credited_at: true, commission_amount: true, released_gross: true, early_released_amount: true, installments: { select: { status: true, amount: true, fee_amount: true, refunded_amount: true, paid_out_at: true } } },
      }),
      this.prisma.paymentTransaction.aggregate({ where: { user_id: vendorId, type: 'vendor_give_back', status: 'succeeded' }, _sum: { amount: true } }),
      this.prisma.user.findUnique({ where: { id: vendorId }, select: { balance: true } }),
    ]);
    return {
      success: true,
      data: {
        ...vendorEarnings(bookings, Number(givenBack._sum.amount ?? 0)),
        // what can be withdrawn now from the Vendly balance
        balance: round2(Math.max(0, Number(vendor?.balance ?? 0))),
        // the rate taken from future payouts (Admin → Settings)
        commission_percent: currentFees().commission,
      },
    };
  }

  // ─── Revenue report (admin) ──────────────────────────────────────────────

  async revenueReport(from: Date, to: Date) {
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { created_at: { gte: from, lt: to }, type: { in: ['booking_installment', 'booking_payment', 'booking_refund', 'booking_payout', 'booking_earning', 'vendly_commission', 'deposit_early_release'] }, status: { in: ['succeeded', 'refunded'] } },
      select: { created_at: true, type: true, amount: true },
    });
    const fees = await this.prisma.bookingInstallment.findMany({ where: { status: { in: [InstallmentStatus.PAID, InstallmentStatus.REFUNDED] }, paid_at: { gte: from, lt: to } }, select: { paid_at: true, fee_amount: true } });
    const days = new Map<string, { date: string; collected: number; fees: number; refunds: number; payouts: number; commission: number }>();
    const day = (d: Date) => {
      const key = d.toISOString().slice(0, 10);
      if (!days.has(key)) days.set(key, { date: key, collected: 0, fees: 0, refunds: 0, payouts: 0, commission: 0 });
      return days.get(key)!;
    };
    for (const r of rows) {
      const d = day(r.created_at);
      const a = Number(r.amount ?? 0);
      if (r.type === 'booking_installment' || r.type === 'booking_payment') d.collected += a;
      else if (r.type === 'booking_refund') d.refunds += a;
      else if (r.type === 'vendly_commission') d.commission += a;
      else d.payouts += a;
    }
    for (const f of fees) if (f.paid_at) day(f.paid_at).fees += Number(f.fee_amount);
    const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, collected: round2(d.collected), fees: round2(d.fees), refunds: round2(d.refunds), payouts: round2(d.payouts), commission: round2(d.commission) }));
    const sum = (k: keyof (typeof list)[number]) => round2(list.reduce((s, d) => s + Number(d[k]), 0));
    return {
      success: true,
      data: {
        from, to,
        totals: { collected: sum('collected'), fees: sum('fees'), refunds: sum('refunds'), payouts: sum('payouts'), commission: sum('commission'), vendly_revenue: round2(sum('fees') + sum('commission')) },
        days: list,
      },
    };
  }

  /**
   * Refunds `amount` of what the customer paid, newest installment first, and voids any
   * uncaptured hold. Returns what was actually refunded. With `keepFees`, the Vendly Protection fee
   * stays paid and only the vendor's part of each installment is refunded.
   */
  async refundBooking(bookingId: string, amount: number, reasonKey: string, opts: { keepFees?: boolean } = {}) {
    const parts = await this.refundParts(bookingId, amount, reasonKey, { ...opts, voidOpen: true });
    return round2(parts.reduce((s, p) => s + p.amount, 0));
  }

  /** The refund behind refundBooking, reporting which installments it came from. */
  /** `heldFirst`: installments not yet paid out to the vendor are refunded before paid-out ones. */
  private async refundParts(bookingId: string, amount: number, reasonKey: string, opts: { keepFees?: boolean; voidOpen?: boolean; stateKey?: boolean; heldFirst?: boolean }): Promise<RefundPart[]> {
    const insts = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId }, orderBy: { sequence: 'desc' } });
    if (opts.heldFirst) insts.sort((x, y) => Number(!!x.paid_out_at) - Number(!!y.paid_out_at));
    let remaining = Math.round(amount * 100) / 100;
    const parts: RefundPart[] = [];
    for (const i of insts) {
      if (!opts.voidOpen && i.status !== InstallmentStatus.PAID) continue;
      if (i.capture_manually && i.status === InstallmentStatus.PROCESSING && i.payment_intent_id) {
        await StripePayment.cancelPaymentIntent(i.payment_intent_id).catch((e) => this.logger.error(`void hold ${i.id}`, e));
        await this.prisma.bookingInstallment.update({ where: { id: i.id }, data: { status: InstallmentStatus.CANCELLED } });
        continue;
      }
      if (i.status === InstallmentStatus.SCHEDULED || i.status === InstallmentStatus.FAILED) {
        await this.prisma.bookingInstallment.update({ where: { id: i.id }, data: { status: InstallmentStatus.CANCELLED } });
        continue;
      }
      if (i.status !== InstallmentStatus.PAID || !i.payment_intent_id || remaining <= 0) continue;
      const left = round2(Number(i.amount) - Number(i.refunded_amount));
      const refundable = opts.keepFees ? vendorPortion(i) : left;
      const take = round2(Math.min(refundable, remaining));
      if (take <= 0) continue;
      const key = opts.stateKey ? `${reasonKey}-${i.id}-${Math.round(Number(i.refunded_amount) * 100)}` : `${reasonKey}-${i.id}`;
      const refund = await StripePayment.refundPaymentIntent(i.payment_intent_id, key, take);
      await this.prisma.bookingInstallment.update({
        where: { id: i.id },
        data: { refunded_amount: { increment: take }, status: take >= left ? InstallmentStatus.REFUNDED : InstallmentStatus.PAID },
      });
      await this.prisma.paymentTransaction.create({ data: { type: 'booking_refund', provider: 'stripe', reference_number: refund.id, order_id: bookingId, status: 'refunded', amount: take, currency: i.currency } });
      remaining = round2(remaining - take);
      parts.push({ installment_id: i.id, amount: take, paid_out: !!i.paid_out_at });
    }
    return parts;
  }

  /** A cancelled booking: unpaid installments are called off and card holds released. */
  async voidOpenCharges(bookingId: string) {
    const open = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, status: { in: [InstallmentStatus.SCHEDULED, InstallmentStatus.FAILED, InstallmentStatus.PROCESSING] } } });
    for (const i of open) {
      if (i.status === InstallmentStatus.PROCESSING) {
        // only an uncaptured hold can be released; a charge still in flight is settled by the webhook
        if (!i.capture_manually || !i.payment_intent_id) continue;
        await StripePayment.cancelPaymentIntent(i.payment_intent_id).catch((e) => this.logger.error(`void hold ${i.id}`, e));
      }
      await this.prisma.bookingInstallment.updateMany({ where: { id: i.id, status: i.status }, data: { status: InstallmentStatus.CANCELLED } });
    }
  }

  // ─── Webhook + timeline ───────────────────────────────────────────────────

  /** Stripe's own view of a charge; makes the record right even if our call timed out. */
  async reconcilePaymentIntent(pi: { id: string; status: string; metadata?: Record<string, string> | null; last_payment_error?: { message?: string } | null }) {
    const installmentId = pi.metadata?.installment_id;
    if (!installmentId) return;
    const inst = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId } });
    if (!inst) return;
    const failure = pi.last_payment_error?.message ?? 'The bank payment was returned';
    // a bank payment that had cleared came back later (returned by the customer's bank)
    if (pi.status === 'requires_payment_method' && inst.status === InstallmentStatus.PAID && inst.payment_intent_id === pi.id && isBank(inst.payment_method_type)) {
      await this.bankPaymentReturned(inst.id, pi.id, failure);
      return;
    }
    if (inst.status === InstallmentStatus.PAID || inst.status === InstallmentStatus.REFUNDED) return;
    // a bank payment still clearing that failed
    if (isClearing(inst) && (pi.status === 'requires_payment_method' || pi.status === 'canceled') && (!inst.payment_intent_id || inst.payment_intent_id === pi.id)) {
      await this.bankPaymentFailed(inst, pi.id, failure);
      return;
    }
    // our charge call timed out while Stripe started the bank payment
    if (pi.status === 'processing' && inst.status === InstallmentStatus.PROCESSING && !inst.clearing_since) {
      await this.markClearing(inst.id, pi.id);
      return;
    }
    if (pi.status === 'succeeded') {
      await this.markPaid(inst.id, pi.id, false);
      await this.undoIfBookingEnded(inst.id);
    } else if (pi.status === 'requires_capture' && inst.status !== InstallmentStatus.PROCESSING) {
      await this.markPaid(inst.id, pi.id, true);
      await this.captureIfCompleted(inst.id);
    } else if (pi.status === 'canceled' && inst.status === InstallmentStatus.PROCESSING) {
      await this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.FAILED, last_error: pi.last_payment_error?.message ?? 'Payment was cancelled' } });
    }
  }

  async timeline(bookingId: string, userId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        customer_id: true, vendor_id: true, status: true, amount: true, service_fee: true, security_deposit: true, currency: true, payment_plan: true, payment_method_id: true, payment_transaction_id: true,
        paid_at: true, release_at: true, released_at: true, customer_approved_at: true, dispute_opened_at: true, dispute_resolved_at: true, event_start_at: true, scheduled_at: true,
        payment_due_by: true, payment_due_kind: true, payment_method_type: true,
        installments: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== userId && b.vendor_id !== userId) throw new ForbiddenException('Access denied');
    // everything refunded to the customer's card (cancellations, disputes, money given back)
    let refunded = round2(b.installments.reduce((s, i) => s + Number(i.refunded_amount), 0));
    if (!b.installments.length && b.paid_at) {
      // bookings paid through hosted Checkout before installments: the refund is a transaction row
      const legacy = await this.prisma.paymentTransaction.aggregate({ where: { type: 'booking_refund', status: 'refunded', order_id: bookingId }, _sum: { amount: true } });
      refunded = round2(Number(legacy?._sum?.amount ?? 0));
    }
    // which card the refund goes back to (customers only; one Stripe call, only when there is a refund)
    const refundCard = refunded > 0 && b.customer_id === userId ? await this.cardLabel(b.payment_method_id) : null;
    const charges = b.installments.filter((i) => i.kind === 'charge' && i.status !== InstallmentStatus.CANCELLED);
    const paid = charges.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0);
    // once scheduled, the installments are the truth (money off from the vendor lowers them)
    const total = charges.length ? charges.reduce((s, i) => s + Number(i.amount), 0) : Number(b.amount ?? 0) + Number(b.service_fee ?? 0);
    const due = charges.length
      ? charges.filter((i) => i.status !== InstallmentStatus.PAID && i.status !== InstallmentStatus.REFUNDED).reduce((s, i) => s + Number(i.amount), 0)
      : Math.max(0, total - paid);
    const extras = b.installments.filter((i) => i.kind !== 'charge' && i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0);
    const givenBack = await this.prisma.paymentTransaction.aggregate({ where: { type: 'vendor_give_back', reference_number: bookingId }, _sum: { amount: true } });
    // bank payments on their way (large bookings): shown as "Processing", paid out once they clear
    const processing = round2(b.installments.filter(isClearing).reduce((s, i) => s + Number(i.amount), 0));
    const large = isLargeBooking(b);
    const refundByBank = refunded > 0 && b.installments.some((i) => Number(i.refunded_amount) > 0 && isBank(i.payment_method_type));
    // the start time passed and the vendor never started: the customer may report a no-show
    const notStarted = pastStartNotStarted(b);
    const canDispute = b.customer_id === userId && !b.released_at && !b.dispute_opened_at && (b.status === BookingStatus.IN_PROGRESS || b.status === BookingStatus.COMPLETED || notStarted);
    // a partial refund the customer asks for stays under this (the vendor's part of what was paid)
    const vendorPaid = canDispute ? (await this.paidSoFar(bookingId, b)).vendorPaid : null;
    return {
      success: true,
      data: {
        plan: b.payment_plan,
        // a missed deposit or balance waiting to be paid by payment_due_by (payment-due.ts)
        payment_state: paymentState(b),
        payment_due_by: paymentState(b) ? b.payment_due_by : null,
        currency: b.currency ?? 'usd',
        total: round2(total),
        paid: Math.round(paid * 100) / 100,
        outstanding: round2(due),
        given_back: round2(Number(givenBack._sum.amount ?? 0)),
        refunded,
        refund_card: refundCard,
        refund_timing: refunded > 0 ? (refundByBank ? 'about 5 business days' : '5–10 business days') : null,
        // a refund of a bank payment: on its way to the bank account for a few days
        refund_by_bank: refundByBank,
        processing,
        // large bookings: 48 hours to fix a failed payment, and a bank account can pay
        large,
        payment_due_hours: paymentDueRules(large).dueHours,
        bank_allowed: !bankNotAllowedReason({ total: Number(b.amount ?? 0) + Number(b.service_fee ?? 0), plan: b.payment_plan, securityDeposit: b.security_deposit }),
        paying_by_bank: isBank(b.payment_method_type),
        // the final invoice (GET /bookings/:id/invoice) once the booking is over and something was paid
        invoice_available: !!b.paid_at && (b.status === BookingStatus.COMPLETED || b.status === BookingStatus.CANCELLED),
        paid_at: b.paid_at,
        release_at: b.release_at,
        released_at: b.released_at,
        customer_approved_at: b.customer_approved_at,
        dispute: b.dispute_opened_at ? { opened_at: b.dispute_opened_at, resolved_at: b.dispute_resolved_at } : null,
        can_dispute: canDispute,
        not_started: notStarted,
        vendor_paid: vendorPaid,
        security_deposit: b.security_deposit != null ? Number(b.security_deposit) : null,
        fees_charged: Math.round(extras * 100) / 100,
        installments: b.installments.map((i) => ({
          id: i.id,
          sequence: i.sequence,
          label: i.label,
          kind: i.kind,
          amount: Number(i.amount),
          fee_amount: Number(i.fee_amount),
          due_at: i.due_at,
          status: i.status,
          paid_at: i.paid_at,
          attempts: i.attempts,
          next_attempt_at: i.next_attempt_at,
          last_error: i.last_error,
          refunded_amount: Number(i.refunded_amount),
          // a bank payment on its way: "Processing" until it clears
          clearing: isClearing(i),
          clearing_since: i.clearing_since,
          by_bank: isBank(i.payment_method_type),
        })),
      },
    };
  }
}
