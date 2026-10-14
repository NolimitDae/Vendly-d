import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import appConfig from 'src/config/app.config';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AUTO_RELEASE_DAYS, buildSchedule, MAX_ATTEMPTS, PROOF_RELEASE_HOURS, RETRY_INTERVAL_MS } from './payment-schedule';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

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
  private async assertOwnsCard(userId: string, paymentMethodId: string) {
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
      select: { id: true, amount: true, service_fee: true, currency: true, event_start_at: true, scheduled_at: true, payment_plan: true, listing_id: true, paid_at: true, installments: { select: { id: true } } },
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

    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { payment_plan: plan } });
      return Promise.all(
        planned.map((p) =>
          tx.bookingInstallment.create({
            data: { booking_id: bookingId, sequence: p.sequence, label: p.label, amount: p.amount, fee_amount: p.fee_amount, currency: booking.currency ?? 'usd', due_at: p.due_at, capture_manually: p.capture_manually },
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
      where: { id: inst.id, status: InstallmentStatus.SCHEDULED, attempts: inst.attempts },
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
        idempotencyKey: `inst-${inst.id}-${attempt}`,
        description: `${b.listing?.title ?? 'Vendly booking'} — ${inst.label}`,
      });
      if (pi.status === 'succeeded' || pi.status === 'requires_capture') {
        return this.markPaid(inst.id, pi.id, pi.status === 'requires_capture');
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
  async runDueCharges(now = new Date()) {
    const due = await this.prisma.bookingInstallment.findMany({
      where: { status: InstallmentStatus.SCHEDULED, OR: [{ attempts: 0, due_at: { lte: now } }, { attempts: { gt: 0 }, next_attempt_at: { lte: now } }] },
      select: { id: true },
      take: 100,
    });
    for (const d of due) await this.chargeInstallment(d.id).catch((e) => this.logger.error(`due charge ${d.id}`, e));
    return due.length;
  }

  // ─── Hold, release, refunds ───────────────────────────────────────────────

  /** Vendor marked the job complete: capture pay-after holds, start the release clock. */
  async onBookingCompleted(bookingId: string, completedAt = new Date()) {
    const holds = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId, capture_manually: true, status: InstallmentStatus.PROCESSING, payment_intent_id: { not: null } } });
    for (const h of holds) {
      try {
        await StripePayment.capturePaymentIntent(h.payment_intent_id!, `capture-${h.id}`);
        await this.markPaid(h.id, h.payment_intent_id!, false);
      } catch (e: any) {
        await this.prisma.bookingInstallment.update({ where: { id: h.id }, data: { status: InstallmentStatus.FAILED, last_error: e?.raw?.message ?? e?.message ?? 'Capture failed' } });
        this.logger.error(`capture ${h.id}`, e);
      }
    }
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
    return { success: true };
  }

  /** Hourly: pay vendors for completed bookings whose release time has passed and that aren't disputed. */
  @Cron(CronExpression.EVERY_HOUR)
  async runReleases(now = new Date()) {
    const due = await this.prisma.booking.findMany({
      where: { status: BookingStatus.COMPLETED, released_at: null, release_at: { lte: now }, OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }] },
      select: { id: true },
      take: 100,
    });
    for (const b of due) await this.releaseBooking(b.id).catch((e) => this.logger.error(`release ${b.id}`, e));
    return due.length;
  }

  /** Vendor share = paid installments minus Vendly fee minus refunds. Transfers to Stripe Connect, else credits the balance. */
  async releaseBooking(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, released_at: true, currency: true, vendor_id: true, amount: true, payout_credited_at: true, dispute_opened_at: true, dispute_resolved_at: true, vendor: { select: { stripe_connect_id: true } }, installments: true },
    });
    if (!b || b.status !== BookingStatus.COMPLETED || b.released_at) return null;
    if (b.dispute_opened_at && !b.dispute_resolved_at) return null;
    const paid = b.installments.filter((i) => i.status === InstallmentStatus.PAID);
    const share = paid.length
      ? paid.reduce((sum, i) => sum + Number(i.amount) - Number(i.fee_amount) - Number(i.refunded_amount), 0)
      : b.payout_credited_at ? 0 : Number(b.amount ?? 0); // legacy checkout bookings have no installments
    const amount = Math.round(share * 100) / 100;
    if (amount <= 0) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { released_at: new Date() } });
      return null;
    }
    const claimed = await this.prisma.booking.updateMany({ where: { id: bookingId, released_at: null }, data: { released_at: new Date(), payout_credited_at: new Date() } });
    if (claimed.count !== 1) return null;
    const currency = b.currency ?? 'usd';
    if (b.vendor.stripe_connect_id) {
      try {
        const transfer = await StripePayment.transferForBooking({ amount, currency, accountId: b.vendor.stripe_connect_id, bookingId, idempotencyKey: `release-${bookingId}` });
        await this.prisma.booking.update({ where: { id: bookingId }, data: { transfer_id: transfer.id } });
        await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_payout', provider: 'stripe', reference_number: transfer.id, status: 'succeeded', amount, currency } });
        return transfer.id;
      } catch (e) {
        this.logger.error(`transfer for ${bookingId} failed; crediting balance instead`, e);
      }
    }
    // no Connect account (or transfer failed): the money waits in the vendor's Vendly balance
    await this.prisma.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: amount } } });
    await this.prisma.paymentTransaction.create({ data: { user_id: b.vendor_id, type: 'booking_earning', provider: 'stripe', reference_number: bookingId, status: 'succeeded', amount, currency } });
    return 'balance';
  }

  /**
   * Refunds `amount` of what the customer paid, newest installment first, and voids any
   * uncaptured hold. Returns what was actually refunded.
   */
  async refundBooking(bookingId: string, amount: number, reasonKey: string) {
    const insts = await this.prisma.bookingInstallment.findMany({ where: { booking_id: bookingId }, orderBy: { sequence: 'desc' } });
    let remaining = Math.round(amount * 100) / 100;
    let refunded = 0;
    for (const i of insts) {
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
      const refundable = Math.round((Number(i.amount) - Number(i.refunded_amount)) * 100) / 100;
      const take = Math.min(refundable, remaining);
      if (take <= 0) continue;
      const refund = await StripePayment.refundPaymentIntent(i.payment_intent_id, `${reasonKey}-${i.id}`, take);
      await this.prisma.bookingInstallment.update({
        where: { id: i.id },
        data: { refunded_amount: { increment: take }, status: take >= refundable ? InstallmentStatus.REFUNDED : InstallmentStatus.PAID },
      });
      await this.prisma.paymentTransaction.create({ data: { type: 'booking_refund', provider: 'stripe', reference_number: refund.id, status: 'refunded', amount: take, currency: i.currency } });
      remaining -= take;
      refunded += take;
    }
    return Math.round(refunded * 100) / 100;
  }

  // ─── Webhook + timeline ───────────────────────────────────────────────────

  /** Stripe's own view of a charge; makes the record right even if our call timed out. */
  async reconcilePaymentIntent(pi: { id: string; status: string; metadata?: Record<string, string> | null; last_payment_error?: { message?: string } | null }) {
    const installmentId = pi.metadata?.installment_id;
    if (!installmentId) return;
    const inst = await this.prisma.bookingInstallment.findUnique({ where: { id: installmentId } });
    if (!inst || inst.status === InstallmentStatus.PAID || inst.status === InstallmentStatus.REFUNDED) return;
    if (pi.status === 'succeeded') await this.markPaid(inst.id, pi.id, false);
    else if (pi.status === 'requires_capture' && inst.status !== InstallmentStatus.PROCESSING) await this.markPaid(inst.id, pi.id, true);
    else if (pi.status === 'canceled' && inst.status === InstallmentStatus.PROCESSING) {
      await this.prisma.bookingInstallment.update({ where: { id: inst.id }, data: { status: InstallmentStatus.FAILED, last_error: pi.last_payment_error?.message ?? 'Payment was cancelled' } });
    }
  }

  async timeline(bookingId: string, userId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customer_id: true, vendor_id: true, amount: true, service_fee: true, currency: true, payment_plan: true, paid_at: true, release_at: true, released_at: true, customer_approved_at: true, dispute_opened_at: true, dispute_resolved_at: true, installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.customer_id !== userId && b.vendor_id !== userId) throw new ForbiddenException('Access denied');
    const paid = b.installments.filter((i) => i.status === InstallmentStatus.PAID).reduce((s, i) => s + Number(i.amount) - Number(i.refunded_amount), 0);
    const total = Number(b.amount ?? 0) + Number(b.service_fee ?? 0);
    return {
      success: true,
      data: {
        plan: b.payment_plan,
        currency: b.currency ?? 'usd',
        total,
        paid: Math.round(paid * 100) / 100,
        outstanding: Math.round(Math.max(0, total - paid) * 100) / 100,
        paid_at: b.paid_at,
        release_at: b.release_at,
        released_at: b.released_at,
        customer_approved_at: b.customer_approved_at,
        dispute: b.dispute_opened_at ? { opened_at: b.dispute_opened_at, resolved_at: b.dispute_resolved_at } : null,
        installments: b.installments.map((i) => ({
          id: i.id,
          sequence: i.sequence,
          label: i.label,
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
