import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { withBookingLock, withJobLock } from 'src/common/helper/job-lock';
import * as Sentry from '@sentry/nestjs';
import { BookingExtraStatus, BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { currentFees } from 'src/modules/platform/platform-settings.service';
import { AUTO_RELEASE_DAYS, buildSchedule, MAX_ATTEMPTS, PROOF_RELEASE_HOURS, RETRY_INTERVAL_MS } from './payment-schedule';
import { track } from 'src/common/analytics';
import { vendorEarnings } from './vendor-earnings';

const HOUR = 3600 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Stripe's smallest card charge in USD. */
const MIN_CHARGE = 0.5;
const DAY = 24 * HOUR;
const SECURITY_DEPOSIT = 'security_deposit';
/** Rental deposit holds are placed this many days before pickup. */
const SECURITY_HOLD_LEAD_DAYS = 1;

/** What of an installment is the vendor's: its amount less the Vendly Protection fee and refunds. */
export const vendorPortion = (i: { amount: unknown; fee_amount: unknown; refunded_amount: unknown }) =>
  round2(Math.max(0, Number(i.amount) - Number(i.fee_amount) - Number(i.refunded_amount)));

const isPaid = (i: { status: InstallmentStatus }) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED;

export interface RefundPart {
  installment_id: string;
  amount: number;
  /** the vendor had already been paid this installment's share */
  paid_out: boolean;
}

/** Stripe statuses a saved-card charge can land in that still need the customer. */
const NEEDS_CUSTOMER = new Set(['requires_action', 'requires_payment_method', 'requires_confirmation']);

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
    if (user.billing_id) return user.billing_id;
    const customer = await StripePayment.createCustomer({ user_id: user.id, email: user.email ?? '', name: user.name ?? '' });
    if (!customer?.id) throw new BadRequestException('Could not create a billing profile');
    await this.prisma.user.update({ where: { id: userId }, data: { billing_id: customer.id } });
    return customer.id;
  }

  async createSetupIntent(userId: string) {
    const customerId = await this.customerIdFor(userId);
    const intent = await StripePayment.createSetupIntent(customerId);
    return { success: true, data: { client_secret: intent.client_secret, customer_id: customerId } };
  }

  async listCards(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { billing_id: true } });
    if (!user?.billing_id) return { success: true, data: [] };
    const [cards, customer] = await Promise.all([StripePayment.listCards(user.billing_id), StripePayment.getCustomerByID(user.billing_id)]);
    const defaultId = (customer as any)?.invoice_settings?.default_payment_method ?? null;
    return {
      success: true,
      data: cards.map((c) => ({
        id: c.id,
        brand: c.card?.brand,
        last4: c.card?.last4,
        exp_month: c.card?.exp_month,
        exp_year: c.card?.exp_year,
        is_default: c.id === defaultId,
      })),
    };
  }

  /** Confirms a payment method belongs to this user before it is used or removed. */
  async assertOwnsCard(userId: string, paymentMethodId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { billing_id: true } });
    const pm = await StripePayment.retrievePaymentMethod(paymentMethodId).catch(() => null);
    const owner = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
    if (!pm || !user?.billing_id || owner !== user.billing_id) throw new ForbiddenException('That card is not on your account');
    return user.billing_id;
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
      select: { id: true, amount: true, service_fee: true, security_deposit: true, currency: true, event_start_at: true, scheduled_at: true, payment_plan: true, listing_id: true, paid_at: true, installments: { select: { id: true } } },
    });
    if (!booking || booking.installments.length > 0 || booking.paid_at) return [];
    const plan = booking.payment_plan ?? (await this.planForListing(booking.listing_id));
    const planned = buildSchedule({
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
      const holdAt = start ? new Date(Math.max(acceptedAt.getTime(), start.getTime() - SECURITY_HOLD_LEAD_DAYS * DAY)) : acceptedAt;
      rows_.push({ sequence: planned.length + 1, label: 'Security deposit (refundable hold)', amount: deposit, fee_amount: 0, due_at: holdAt, capture_manually: true, kind: SECURITY_DEPOSIT });
    }

    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { payment_plan: plan } });
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
      include: { booking: { select: { id: true, customer_id: true, payment_method_id: true, status: true, listing: { select: { title: true } }, customer: { select: { email: true, name: true, billing_id: true } } } } },
    });
    if (!inst) return null;
    if (inst.status !== InstallmentStatus.SCHEDULED) return inst;
    const b = inst.booking;
    if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.REJECTED) {
      return this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.CANCELLED } });
    }
    const paymentMethod = paymentMethodOverride ?? b.payment_method_id;
    if (!paymentMethod || !b.customer.billing_id) {
      return this.recordFailure(inst.id, inst.attempts, 'No saved card on this booking', b, inst);
    }
    // claim the attempt so two workers can't double charge
    const claimed = await this.prisma.bookingInstallment.updateMany({
      // the amount too: if the vendor lowered it since we read it, the next run charges the new amount
      where: { id: inst.id, status: InstallmentStatus.SCHEDULED, attempts: inst.attempts, amount: inst.amount },
      data: { status: InstallmentStatus.PROCESSING, attempts: { increment: 1 } },
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
        captureManually: inst.capture_manually,
        // a customer retry resets the attempts, so the key also carries when the row last changed
        idempotencyKey: `inst-${inst.id}-${attempt}-${inst.updated_at ? new Date(inst.updated_at).getTime() : 0}`,
        description: `${b.listing?.title ?? 'Vendly booking'} — ${inst.label}`,
      });
      if (pi.status === 'succeeded' || pi.status === 'requires_capture') {
        track(pi.status === 'requires_capture' ? 'payment_authorized' : 'payment_succeeded', b.customer_id, { booking_id: b.id, amount: Number(inst.amount), label: inst.label });
        const marked = await this.markPaid(inst.id, pi.id, pi.status === 'requires_capture');
        await this.undoIfBookingEnded(inst.id);
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
        if (done.count === 1) await this.prisma.paymentTransaction.create({ data: { type: 'booking_refund', provider: 'stripe', reference_number: refund.id, status: 'refunded', amount: left, currency: i.currency } });
      }
    } catch (e) {
      this.logger.error(`undo charge ${i.id} on an ended booking`, e);
      Sentry.captureException(e, { tags: { job: 'ended-booking-charge' }, extra: { installment_id: i.id } });
    }
  }

  /** PAID (or authorized, for pay-after-service) and the booking's paid_at on the first success. */
  private async markPaid(installmentId: string, paymentIntentId: string, authorizedOnly: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const inst = await tx.bookingInstallment.update({
        where: { id: installmentId },
        data: authorizedOnly
          ? { status: InstallmentStatus.PROCESSING, payment_intent_id: paymentIntentId, last_error: null, next_attempt_at: null }
          : { status: InstallmentStatus.PAID, payment_intent_id: paymentIntentId, paid_at: new Date(), last_error: null, next_attempt_at: null },
      });
      await tx.paymentTransaction.create({
        data: {
          user_id: (await tx.booking.findUnique({ where: { id: inst.booking_id }, select: { customer_id: true } }))?.customer_id,
          type: authorizedOnly ? 'booking_authorization' : 'booking_installment',
          provider: 'stripe',
          reference_number: paymentIntentId,
          status: authorizedOnly ? 'authorized' : 'succeeded',
          amount: inst.amount,
          currency: inst.currency,
        },
      });
      if (!authorizedOnly) await tx.booking.updateMany({ where: { id: inst.booking_id, paid_at: null }, data: { paid_at: new Date() } });
      return inst;
    });
  }

  private async recordFailure(
    installmentId: string,
    attempt: number,
    message: string,
    b: { id: string; customer_id: string; listing: { title: string } | null; customer: { email: string | null; name: string | null } },
    inst: { label: string; amount: unknown },
    paymentIntentId?: string,
    needsCustomer = false,
  ) {
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
      ? `We couldn't take the ${inst.label.toLowerCase()} of $${Number(inst.amount).toFixed(2)} for ${title}. Please pay with another card to keep your booking.`
      : `We couldn't take the ${inst.label.toLowerCase()} of $${Number(inst.amount).toFixed(2)} for ${title} (${message}). We'll try again in 24 hours, or you can update your card now.`;
    if (b.customer.email) {
      await this.mail
        .sendBookingNotification({ to: b.customer.email, recipientName: b.customer.name ?? '', subject: `Payment problem — ${title}`, message: body, status: 'PAYMENT_FAILED', listingTitle: title, amount: Number(inst.amount), ctaUrl: `${clientUrl}/bookings/${b.id}` })
        .catch(() => null);
    }
    void this.push.sendToUser(b.customer_id, { title: 'Payment problem', body, data: { type: 'booking', bookingId: b.id } });
    return updated;
  }

  /** Customer retries a failed installment, optionally with a different saved card. */
  async retryInstallment(bookingId: string, installmentId: string, customerId: string, paymentMethodId?: string) {
    const inst = await this.prisma.bookingInstallment.findFirst({ where: { id: installmentId, booking_id: bookingId }, include: { booking: { select: { customer_id: true } } } });
    if (!inst) throw new NotFoundException('Installment not found');
    if (inst.booking.customer_id !== customerId) throw new ForbiddenException('Access denied');
    if (inst.status !== InstallmentStatus.FAILED && inst.status !== InstallmentStatus.SCHEDULED) throw new BadRequestException('This installment is not waiting for payment');
    if (paymentMethodId) {
      await this.assertOwnsCard(customerId, paymentMethodId);
      await this.prisma.booking.update({ where: { id: bookingId }, data: { payment_method_id: paymentMethodId } });
    }
    // a fresh attempt window: the retry counter starts over for the new card
    await this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.SCHEDULED, attempts: 0, next_attempt_at: null } });
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
      for (const h of holds) {
        try {
          // the installment amount, which is less than the hold when the vendor gave money off
          await StripePayment.capturePaymentIntent(h.payment_intent_id!, `capture-${h.id}`, Number(h.amount));
          await this.markPaid(h.id, h.payment_intent_id!, false);
        } catch (e: any) {
          await this.prisma.bookingInstallment.update({ where: { id: h.id }, data: { status: InstallmentStatus.FAILED, last_error: e?.raw?.message ?? e?.message ?? 'Capture failed' } });
          this.logger.error(`capture ${h.id}`, e);
        }
      }
    }).catch((e) => {
      this.logger.error(`captures for ${bookingId}`, e);
      Sentry.captureException(e, { tags: { job: 'completion-capture' }, extra: { booking_id: bookingId } });
    });
    const lastProof = await this.prisma.bookingProof.findFirst({ where: { booking_id: bookingId }, orderBy: { created_at: 'desc' }, select: { created_at: true } });
    const auto = new Date(completedAt.getTime() + AUTO_RELEASE_DAYS * DAY);
    const byProof = lastProof ? new Date(lastProof.created_at.getTime() + PROOF_RELEASE_HOURS * HOUR) : null;
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

  async openDispute(bookingId: string, customerId: string, reason: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, status: true, released_at: true, dispute_opened_at: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== customerId) throw new ForbiddenException('Access denied');
    if (b.released_at) throw new BadRequestException('Payment for this booking has already been released. Contact support.');
    if (b.dispute_opened_at) throw new BadRequestException('A dispute is already open.');
    if (!([BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] as BookingStatus[]).includes(b.status)) throw new BadRequestException('You can dispute a booking once the service has started.');
    await this.prisma.booking.update({ where: { id: bookingId }, data: { dispute_opened_at: new Date(), dispute_reason: reason } });
    track('dispute_opened', customerId, { booking_id: bookingId });
    await this.notifyDispute(bookingId, reason).catch((e) => this.logger.error(`dispute notices ${bookingId}`, e));
    return { success: true };
  }

  /** The vendor and Vendly's admins hear about a new dispute straight away; the payout stays held meanwhile. */
  private async notifyDispute(bookingId: string, reason: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { vendor_id: true, listing: { select: { title: true } }, customer: { select: { name: true } }, vendor: { select: { email: true, name: true } } },
    });
    if (!b) return;
    const title = b.listing?.title ?? 'a booking';
    const who = b.customer?.name ?? 'The customer';
    const body = `${who} reported a problem with ${title}: "${reason.slice(0, 300)}". Your payment for this booking is held while Vendly looks into it. Reply from the booking to give your side.`;
    void this.push.sendToUser(b.vendor_id, { title: 'A customer reported a problem', body, data: { type: 'booking', bookingId } });
    if (b.vendor?.email) {
      await this.mail
        .sendBookingNotification({ to: b.vendor.email, recipientName: b.vendor.name ?? '', subject: `Problem reported — ${title}`, message: body, status: 'DISPUTED', listingTitle: title, ctaUrl: `${appConfig().app.client_app_url}/vendor/bookings/${bookingId}` })
        .catch(() => null);
    }
    const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true } });
    for (const a of admins) void this.push.sendToUser(a.id, { title: 'New dispute', body: `${who} opened a dispute on ${title}.`, data: { type: 'dispute', bookingId } });
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
      where: { status: BookingStatus.COMPLETED, released_at: null, release_at: { lte: now }, OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }] },
      select: { id: true },
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
    return withBookingLock(this.prisma, bookingId, () => this.releaseBookingLocked(bookingId));
  }

  private async releaseBookingLocked(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, released_at: true, currency: true, vendor_id: true, amount: true, payout_credited_at: true, dispute_opened_at: true, dispute_resolved_at: true, early_released_amount: true, vendor: { select: { stripe_connect_id: true, balance: true } }, installments: true },
    });
    if (!b || b.status !== BookingStatus.COMPLETED || b.released_at) return null;
    if (b.dispute_opened_at && !b.dispute_resolved_at) return null;
    // rentals are paid out once the vendor has checked the items back in
    const outstanding = await this.prisma.rentalReservation.count({ where: { booking_id: bookingId, status: 'ACTIVE' } });
    if (outstanding > 0) return null;
    const paid = b.installments.filter(isPaid);
    // an installment refunded past the vendor's part (fee included) counts as nothing, never as minus
    const gross = round2(
      paid.length
        ? paid.reduce((sum, i) => sum + vendorPortion(i), 0)
        : b.payout_credited_at ? 0 : Number(b.amount ?? 0), // legacy checkout bookings have no installments
    );
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
        await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_payout', provider: 'stripe', reference_number: transfer.id, status: 'succeeded', amount: toPay, currency } });
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

    const extra = round2(fees - captured);
    let extraInstallment: string | null = null;
    if (extra > 0) {
      const last = await this.prisma.bookingInstallment.findFirst({ where: { booking_id: bookingId }, orderBy: { sequence: 'desc' }, select: { sequence: true, currency: true } });
      const row = await this.prisma.bookingInstallment.create({
        data: { booking_id: bookingId, sequence: (last?.sequence ?? 0) + 1, label: 'Damage and late fees', amount: extra, fee_amount: 0, currency: last?.currency ?? 'usd', due_at: new Date(), kind: 'extra' },
      });
      extraInstallment = row.id;
      await this.chargeInstallment(row.id).catch((e) => this.logger.error(`extra fees ${row.id}`, e));
    }
    return { captured_from_deposit: captured, charged_extra: extra, deposit_released: !!hold && captured === 0, extra_installment_id: extraInstallment };
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
      select: { vendor_id: true, status: true, currency: true, early_released_amount: true, dispute_opened_at: true, dispute_resolved_at: true, vendor: { select: { stripe_connect_id: true } }, installments: { orderBy: { sequence: 'asc' } }, contracts: { where: { status: 'EXECUTED' }, select: { id: true }, take: 1 } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    if (!([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] as BookingStatus[]).includes(b.status)) throw new BadRequestException('Deposits can be released once the booking is confirmed.');
    if (!b.contracts.length) throw new BadRequestException('The contract must be signed by both sides first.');
    if (b.dispute_opened_at && !b.dispute_resolved_at) throw new BadRequestException('This booking has an open dispute.');
    if (Number(b.early_released_amount ?? 0) > 0) throw new BadRequestException('The deposit for this booking was already released.');
    const deposit = b.installments[0];
    if (!deposit || b.installments.length < 2 || deposit.status !== InstallmentStatus.PAID) throw new BadRequestException('There is no paid deposit to release on this booking.');
    if (!b.vendor.stripe_connect_id) throw new BadRequestException('Connect a bank account in Payments & Payouts first.');
    const amount = round2(Number(deposit.amount) - Number(deposit.fee_amount) - Number(deposit.refunded_amount));
    if (amount <= 0) throw new BadRequestException('There is no deposit left to release.');

    const claimed = await this.prisma.booking.updateMany({ where: { id: bookingId, early_released_amount: 0 }, data: { early_released_amount: amount } });
    if (claimed.count !== 1) throw new BadRequestException('The deposit for this booking was already released.');
    const currency = b.currency ?? 'usd';
    try {
      const transfer = await StripePayment.transferForBooking({ amount, currency, accountId: b.vendor.stripe_connect_id, bookingId, idempotencyKey: `early-${bookingId}` });
      await this.prisma.paymentTransaction.create({ data: { user_id: vendorId, type: 'deposit_early_release', provider: 'stripe', reference_number: transfer.id, status: 'succeeded', amount, currency } });
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
      const refundable = round2(b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + vendorPortion(i), 0));
      const max = round2(lowerable + refundable);
      if (max <= 0) throw new BadRequestException('There is nothing paid or due on this booking to give back.');
      if (amount > max) throw new BadRequestException(`You can give back up to $${max.toFixed(2)} on this booking.`);

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
        const parts = await this.refundParts(bookingId, remaining, 'giveback', { keepFees: true, stateKey: true });
        refunded = round2(parts.reduce((s, p) => s + p.amount, 0));
        // money the vendor was already paid comes back from their balance, less Vendly's commission on it
        const rate = Number(b.released_gross ?? 0) > 0 ? Number(b.commission_amount ?? 0) / Number(b.released_gross) : currentFees().commission / 100;
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
    void this.push.sendToUser(result.customer_id, { title: 'Money back from your vendor', body, data: { type: 'booking', bookingId } });
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
          await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_payout', provider: 'stripe', reference_number: transfer.id, status: 'succeeded', amount: toPay, currency } });
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

  async listDisputes(status: 'open' | 'resolved' = 'open') {
    const rows = await this.prisma.booking.findMany({
      where: status === 'open' ? { dispute_opened_at: { not: null }, dispute_resolved_at: null } : { dispute_resolved_at: { not: null } },
      orderBy: { dispute_opened_at: 'asc' },
      select: {
        id: true, status: true, amount: true, service_fee: true, currency: true, dispute_opened_at: true, dispute_reason: true, dispute_resolved_at: true, dispute_resolution: true, released_at: true, completed_at: true,
        dispute_vendor_reply: true, dispute_vendor_replied_at: true,
        listing: { select: { title: true } },
        customer: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true, email: true } },
        installments: { select: { status: true, amount: true, fee_amount: true, refunded_amount: true } },
        proofs: { select: { id: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 1 },
      },
      take: 200,
    });
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        paid: round2(r.installments.filter((i) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0)),
        has_proof: r.proofs.length > 0,
      })),
    };
  }

  /**
   * Admin decision on a dispute. refund: everything back to the customer (fee included), nothing to
   * the vendor. partial_refund: `amount` back to the customer, the rest released. release: vendor paid in full.
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
      select: { id: true, status: true, dispute_opened_at: true, dispute_resolved_at: true, released_at: true, vendor_id: true, currency: true, early_released_amount: true, listing: { select: { title: true } }, customer: { select: { email: true, name: true } }, vendor: { select: { email: true, name: true } }, installments: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (!b.dispute_opened_at || b.dispute_resolved_at) throw new BadRequestException('This booking has no open dispute.');
    if (b.released_at) throw new BadRequestException('Payment for this booking was already released.');
    const paid = round2(b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0));
    // a partial refund comes out of the vendor's part; the Vendly Protection fee goes back only with a full refund
    const vendorPaid = round2(b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + vendorPortion(i), 0));

    let refunded = 0;
    if (input.action === 'refund') {
      refunded = await this.refundBooking(bookingId, paid, `dispute-${bookingId}`);
      // nothing more is charged on a fully refunded booking
      await this.prisma.bookingExtra.updateMany({ where: { booking_id: bookingId, status: { in: [BookingExtraStatus.PENDING, BookingExtraStatus.IN_REVIEW] } }, data: { status: BookingExtraStatus.CANCELLED } });
    } else if (input.action === 'partial_refund') {
      const amt = round2(Number(input.amount ?? 0));
      if (amt <= 0 || amt >= vendorPaid) throw new BadRequestException(`A partial refund must be more than $0 and less than $${vendorPaid.toFixed(2)} (the vendor's part of what was paid).`);
      refunded = await this.refundBooking(bookingId, amt, `dispute-${bookingId}`, { keepFees: true });
    }
    const note = `${input.action}${refunded ? ` ($${refunded.toFixed(2)} refunded)` : ''} by admin ${adminId}: ${input.note}`;
    await this.prisma.booking.update({ where: { id: bookingId }, data: { dispute_resolved_at: new Date(), dispute_resolution: note } });

    if (input.action === 'refund') {
      // vendor gets nothing; anything paid out early is owed back
      const early = Number(b.early_released_amount ?? 0);
      await this.prisma.booking.update({ where: { id: bookingId }, data: { released_at: new Date(), payout_credited_at: new Date() } });
      if (early > 0) await this.recordRecovery(b.vendor_id, bookingId, -early, b.currency ?? 'usd');
    }

    const title = b.listing?.title ?? 'your booking';
    const message =
      input.action === 'release'
        ? `Vendly reviewed the problem reported on ${title} and released the payment to the vendor. ${input.note}`
        : `Vendly reviewed the problem reported on ${title} and refunded $${refunded.toFixed(2)} to the customer. ${input.note}`;
    for (const who of [b.customer, b.vendor]) {
      if (who?.email) await this.mail.sendBookingNotification({ to: who.email, recipientName: who.name ?? '', subject: `Dispute resolved — ${title}`, message, status: 'DISPUTE_RESOLVED', listingTitle: title }).catch(() => null);
    }
    track('dispute_resolved', adminId, { booking_id: bookingId, action: input.action, refunded });
    return { refunded, releaseNow: input.action !== 'refund' && b.status === BookingStatus.COMPLETED };
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
  private async refundParts(bookingId: string, amount: number, reasonKey: string, opts: { keepFees?: boolean; voidOpen?: boolean; stateKey?: boolean }): Promise<RefundPart[]> {
    const insts = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId }, orderBy: { sequence: 'desc' } });
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
      await this.prisma.paymentTransaction.create({ data: { type: 'booking_refund', provider: 'stripe', reference_number: refund.id, status: 'refunded', amount: take, currency: i.currency } });
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
    if (!inst || inst.status === InstallmentStatus.PAID || inst.status === InstallmentStatus.REFUNDED) return;
    if (pi.status === 'succeeded') {
      await this.markPaid(inst.id, pi.id, false);
      await this.undoIfBookingEnded(inst.id);
    } else if (pi.status === 'requires_capture' && inst.status !== InstallmentStatus.PROCESSING) await this.markPaid(inst.id, pi.id, true);
    else if (pi.status === 'canceled' && inst.status === InstallmentStatus.PROCESSING) {
      await this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.FAILED, last_error: pi.last_payment_error?.message ?? 'Payment was cancelled' } });
    }
  }

  async timeline(bookingId: string, userId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customer_id: true, vendor_id: true, amount: true, service_fee: true, security_deposit: true, currency: true, payment_plan: true, paid_at: true, release_at: true, released_at: true, customer_approved_at: true, dispute_opened_at: true, dispute_resolved_at: true, installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== userId && b.vendor_id !== userId) throw new ForbiddenException('Access denied');
    const charges = b.installments.filter((i) => i.kind === 'charge' && i.status !== InstallmentStatus.CANCELLED);
    const paid = charges.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0);
    // once scheduled, the installments are the truth (money off from the vendor lowers them)
    const total = charges.length ? charges.reduce((s, i) => s + Number(i.amount), 0) : Number(b.amount ?? 0) + Number(b.service_fee ?? 0);
    const due = charges.length
      ? charges.filter((i) => i.status !== InstallmentStatus.PAID && i.status !== InstallmentStatus.REFUNDED).reduce((s, i) => s + Number(i.amount), 0)
      : Math.max(0, total - paid);
    const extras = b.installments.filter((i) => i.kind !== 'charge' && i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0);
    const givenBack = await this.prisma.paymentTransaction.aggregate({ where: { type: 'vendor_give_back', reference_number: bookingId }, _sum: { amount: true } });
    return {
      success: true,
      data: {
        plan: b.payment_plan,
        currency: b.currency ?? 'usd',
        total: round2(total),
        paid: Math.round(paid * 100) / 100,
        outstanding: round2(due),
        given_back: round2(Number(givenBack._sum.amount ?? 0)),
        paid_at: b.paid_at,
        release_at: b.release_at,
        released_at: b.released_at,
        customer_approved_at: b.customer_approved_at,
        dispute: b.dispute_opened_at ? { opened_at: b.dispute_opened_at, resolved_at: b.dispute_resolved_at } : null,
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
        })),
      },
    };
  }
}
