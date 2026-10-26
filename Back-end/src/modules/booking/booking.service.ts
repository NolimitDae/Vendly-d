import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AddOnKind, BookingContractStatus, BookingExtraStatus, BookingStatus, ListingStatus, Prisma } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { DELIVERABLE_FILES, PHOTOS, safeStoredNames } from 'src/common/helper/upload-files';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { rentalTitle } from 'src/modules/rentals/rentals.service';
import { ChatExtrasService } from 'src/modules/chat/extras/chat-extras.service';
import { EventToolsService } from 'src/modules/events/tools/event-tools.service';
import { BookingContractsService, RequestMeta } from 'src/modules/contracts/booking-contracts.service';
import { SignedBookingRequestDto, VendorConfirmDto } from 'src/modules/contracts/dto/contracts.dto';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';
import { CancellationSummary, cancellationMessage, depositPlanVendorOwed, PaidInstallment, REFUND_TIMING, settleAgainstPaid, settleCancellation, Settlement } from './cancellation';
import { CANCELLATION_PRESETS } from 'src/modules/contracts/contract-templates';
import { currentFees } from 'src/modules/platform/platform-settings.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { track } from 'src/common/analytics';
import { requestExpiresAt } from './booking-requests';
import { withBookingLock } from 'src/common/helper/job-lock';
import * as Sentry from '@sentry/nestjs';
import { eventDays } from 'src/modules/calendar-sync/busy-days';
import { disputePhotoUrls } from 'src/modules/payments/dispute-files';
import { requestPhotoUrls } from './request-photos';
import { CustomerBookingTab, customerTabOrder, customerTabWhere } from './customer-tabs';
import { NO_SHOW_HINT, pastStartNotStarted } from './no-show';
import { CancelledBy, cancelReasonLabel, cancelReasonsFor, countsAgainstVendor, describeCancelReason, NON_PAYMENT } from './cancel-reasons';
import { TRACK_THRESHOLD, TRACK_WINDOW_DAYS, trackWindowStart, vendorCancellationCounts } from './vendor-cancellations';
import { deadlineText, isDepositPlan, paymentState, PAYMENT_STATE_LABELS } from 'src/modules/payments/payment-due';
import { depositShareOf } from 'src/modules/payments/payment-schedule';
import { MarketplaceService } from 'src/modules/marketplace/marketplace.service';
import { GeocodeService } from 'src/modules/geo/geocode.service';
import { trackerDetails } from './booking-tracker';
import { chosenGroupText, readChosenOptions } from 'src/modules/add-ons/package-options';

/** Extra tabs on the vendor's bookings list. */
export const VENDOR_BOOKING_FILTERS = ['refunds', 'complaints'] as const;
export type VendorBookingFilter = (typeof VENDOR_BOOKING_FILTERS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Why a booking with an open dispute can't be cancelled. */
const OPEN_DISPUTE = 'This booking has an open dispute. Vendly will settle the money when it is resolved, so it can’t be cancelled now.';

/** Bookings that can still be cancelled. */
const CANCELLABLE: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];

/** A deposit plan's missed payment whose 12 hours to pay (payments/payment-due.ts) are still running. */
const payWindowOpen = (b: { deposit_rules?: boolean | null; payment_due_by?: Date | null }, now = new Date()) =>
  !!b.deposit_rules && !!b.payment_due_by && b.payment_due_by > now;

/** A booking as getBookingOrFail loads it. */
type BookingRow = Awaited<ReturnType<BookingService['getBookingOrFail']>>;

/** What cancelling a booking does with its money (see BookingService.cancellationTerms). */
interface CancellationTerms {
  /** whose rules settle the money: the vendor's own cancellation refunds everything, the rest settle as a customer's */
  cancelledBy: 'CUSTOMER' | 'VENDOR';
  /** deposit plans: the paid deposit the vendor keeps (non-refundable) */
  depositKept: number;
  settlement: Settlement;
  installments: { status: string; amount: unknown; fee_amount: unknown; refunded_amount: unknown; kind: string; capture_manually: boolean; payment_intent_id: string | null }[];
  policyKey: string | null;
  /** anything was paid (booking.paid_at) */
  paid: boolean;
  feeKept: number;
  unpaidCancelled: number;
  holdsReleased: number;
  /** part of the refund that didn't go through (recorded as refund_failed and reported) */
  refundFailed?: number;
}

/**
 * Whose rules settle a cancellation's money: a vendor cancelling for their own reasons refunds
 * everything; a vendor cancelling because the customer didn't pay, and Vendly's non-payment
 * cancellation, settle like the customer's (cancellation.ts).
 */
export function settlementSide(by: string, code?: string | null): 'CUSTOMER' | 'VENDOR' {
  return by === 'VENDOR' && code !== 'customer_didnt_pay' ? 'VENDOR' : 'CUSTOMER';
}

/** "2026-11-14": the day `at` falls on in a time zone (UTC when unknown), as marketplace search takes it. */
export function dayInZone(at: Date, timeZone?: string | null) {
  const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  try {
    return fmt(timeZone || 'UTC');
  } catch {
    return fmt('UTC');
  }
}

/** What the booking is for: the package title, or the rented items. */
function titleOf(booking: any): string | undefined {
  return booking?.listing?.title ?? (booking?.rental_reservations?.length ? rentalTitle(booking.rental_reservations) : undefined);
}

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private pushService: PushService,
    private contracts: BookingContractsService,
    private chatExtras: ChatExtrasService,
    private eventTools: EventToolsService,
    private payments: PaymentsService,
    private marketplace: MarketplaceService,
    // puts the venue on the booking map in the background (missing in tests that don't load it)
    @Optional() private geocoder?: GeocodeService,
  ) {}

  private pushBooking(userId: string, bookingId: string, title: string, body: string) {
    void this.pushService.sendToUser(userId, {
      title,
      body,
      data: { type: 'booking', bookingId },
    }, 'booking_updates');
  }

  async create(customerId: string, dto: SignedBookingRequestDto, meta: RequestMeta = {}, photos: { buffer: Buffer; size?: number }[] = []) {
    // validates the listing, the signed contract and creates booking + contract atomically
    const created = await this.contracts.createSignedBooking(customerId, dto, meta, photos);
    track('booking_requested', customerId, { booking_id: created.id, listing_id: dto.listing_id, with_quote: !!dto.quote_id, for_event: !!dto.event_id, photos: photos.length });
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
      include: this.bookingIncludes(),
    });
    const listing = { title: titleOf(booking) ?? 'Service', vendor: booking.vendor };
    const customer = booking.customer;
    // what the customer picked for the package's customizations ("Style: Knotless")
    const chosen = readChosenOptions(booking.chosen_options).map(chosenGroupText).join('; ');

    // notify vendor via email
    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: listing.vendor.email,
      recipientName: listing.vendor.name,
      subject: `New booking request — ${listing.title}`,
      message: (created.awaiting_client
        ? `${customer.name} signed the contract and sent a booking request. Their client is co-signing it too; you can Accept & Sign once they have.`
        : `${customer.name} signed the contract and sent a booking request. Review it, then Accept & Sign or decline.`) + (chosen ? ` They chose: ${chosen}.` : ''),
      status: 'PENDING',
      listingTitle: listing.title,
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/vendor/bookings/${booking.id}`,
      topic: 'booking_updates',
    }).catch(() => null);
    this.pushBooking(booking.vendor_id, booking.id, 'New signed booking request', `${customer.name} requested ${listing.title}`);
    if (created.awaiting_client) await this.contracts.notifyClientToSign(booking.id).catch(() => null);
    // the venue's map position, filled in the background so the request never waits on the geocoder
    if (booking.venue_address) void this.geocoder?.booking(booking.id);

    return { success: true, data: this.formatBooking(booking) };
  }

  async confirm(bookingId: string, vendorId: string, dto: VendorConfirmDto = {}, meta: RequestMeta = {}) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException(
        booking.expired_at ? 'This request closed because it wasn’t answered in time.' : `Cannot confirm a booking in ${booking.status} status`,
      );
    // past its time but not yet closed by the hourly job: still too late
    if (requestExpiresAt(booking) <= new Date()) throw new BadRequestException('This request closed because it wasn’t answered in time.');

    // only while the request is still open: it may have expired since it was loaded
    const stillOpen = () => new BadRequestException('This request closed because it wasn’t answered in time.');
    // Accept & Sign: the vendor's countersignature executes the contract and confirms the booking together
    const executed = await this.contracts.countersignForBooking(bookingId, vendorId, dto.signature, meta, async (tx) => {
      const res = await tx.booking.updateMany({ where: { id: bookingId, status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED, confirmed_at: new Date() } });
      if (!res.count) throw stillOpen();
    });
    if (!executed) {
      const res = await this.prisma.booking.updateMany({ where: { id: bookingId, status: BookingStatus.PENDING }, data: { status: BookingStatus.CONFIRMED, confirmed_at: new Date() } });
      if (!res.count) throw stillOpen();
    }
    // Phase B: snapshot the payment plan and charge the customer's saved card for what is due now
    await this.payments.scheduleForBooking(bookingId).catch((err) => console.error(`Payment schedule for ${bookingId} failed:`, err));
    // the vendor joins the group chat of any event this booking is for
    const events = await this.prisma.eventBooking.findMany({ where: { booking_id: bookingId }, select: { event_id: true } });
    for (const e of events) await this.chatExtras.syncEventChat(e.event_id).catch((err) => console.error(`Event chat for ${e.event_id} failed:`, err));
    // and it gets its own line in the event budget
    if (events.length) await this.eventTools.syncBookingBudget(bookingId).catch((err) => console.error(`Event budget for ${bookingId} failed:`, err));
    track('booking_accepted', vendorId, { booking_id: bookingId, amount: Number(booking.amount ?? 0) });
    const updated = await this.getBookingOrFail(bookingId);

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking confirmed — ${titleOf(booking)}`,
      message: 'Great news! Your booking has been confirmed by the vendor.',
      status: 'CONFIRMED',
      listingTitle: titleOf(booking) ?? 'Service',
      scheduledAt: booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString() : undefined,
      amount: Number(booking.amount),
      ctaUrl: `${clientUrl}/bookings`,
      topic: 'booking_updates',
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking confirmed', `${titleOf(booking) ?? 'Your booking'} was confirmed`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async reject(bookingId: string, vendorId: string, dto: RejectBookingDto) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.PENDING)
      throw new BadRequestException(`Cannot reject a booking in ${booking.status} status`);

    // only while still open: it may have expired or been cancelled since it was loaded
    const claimed = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.PENDING },
      data: { status: BookingStatus.REJECTED, reject_reason: dto.reason },
    });
    if (!claimed.count) throw new BadRequestException('This request is no longer open.');
    const updated = await this.getBookingOrFail(bookingId);
    await this.contracts.voidPendingForBooking(bookingId, 'Vendor declined the booking', vendorId);

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking declined — ${titleOf(booking)}`,
      message: 'Unfortunately, your booking request was not accepted by the vendor.',
      status: 'REJECTED',
      listingTitle: titleOf(booking) ?? 'Service',
      reason: dto.reason,
      ctaUrl: `${clientUrl}/marketplace`,
      topic: 'booking_updates',
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Booking declined', `${titleOf(booking) ?? 'Your booking'} was declined`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async startWork(bookingId: string, vendorId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.CONFIRMED)
      throw new BadRequestException(`Cannot start work on a booking in ${booking.status} status`);

    // only from CONFIRMED: a cancellation that landed since it was loaded must not be overwritten
    const moved = await this.prisma.booking.updateMany({ where: { id: bookingId, status: BookingStatus.CONFIRMED }, data: { status: BookingStatus.IN_PROGRESS, started_at: new Date() } });
    if (moved.count !== 1) throw new BadRequestException('This booking changed in the meantime. Refresh and try again.');
    const updated = await this.getBookingOrFail(bookingId);
    this.pushBooking(booking.customer_id, bookingId, 'Work started', `The vendor has started on ${titleOf(booking) ?? 'your booking'}`);

    return { success: true, data: this.formatBooking(updated) };
  }

  async complete(bookingId: string, vendorId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.vendor_id !== vendorId)
      throw new ForbiddenException('Access denied');
    if (booking.status !== BookingStatus.IN_PROGRESS)
      throw new BadRequestException(`Cannot complete a booking in ${booking.status} status`);
    // the job can't be done before it starts (setting up early is fine: Start work stays open);
    // completing starts the payout clock and captures pay-after-service holds
    const start = booking.event_start_at ?? booking.scheduled_at;
    if (start && start > new Date())
      throw new BadRequestException('You can mark this booking complete once the event has started.');

    // only from IN_PROGRESS: a cancellation that landed since it was loaded must not be overwritten
    const completedAt = new Date();
    const moved = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.IN_PROGRESS },
      data: { status: BookingStatus.COMPLETED, completed_at: completedAt },
    });
    if (moved.count !== 1) throw new BadRequestException('This booking changed in the meantime. Refresh and try again.');
    const updated = await this.getBookingOrFail(bookingId);
    await this.payments.onBookingCompleted(bookingId, completedAt).catch((err) => console.error(`Completion payments for ${bookingId} failed:`, err));

    const clientUrl = appConfig().app.client_app_url;
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Service completed — ${titleOf(booking)}`,
      message: 'Your service has been completed! We\'d love to hear your feedback.',
      status: 'COMPLETED',
      listingTitle: titleOf(booking) ?? 'Service',
      ctaUrl: `${clientUrl}/bookings`,
      topic: 'booking_updates',
    }).catch(() => null);
    this.pushBooking(booking.customer_id, bookingId, 'Service completed', `${titleOf(booking) ?? 'Your booking'} is complete — leave a review`);

    return { success: true, data: this.formatBooking(updated) };
  }

  /**
   * Records a paid Checkout session (called from the Stripe webhook). A second payment for an
   * already-paid booking is refunded; a retried webhook for the same session is a no-op.
   */
  async recordPayment(session: { id: string; payment_intent?: string | { id: string } | null; amount_total?: number | null; currency?: string | null; metadata?: Record<string, string> | null }) {
    const bookingId = session.metadata?.booking_id;
    if (!bookingId) return;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const seen = await tx.paymentTransaction.findFirst({ where: { reference_number: session.id } });
      // a refund that didn't go through last time is tried again (same key: never refunded twice)
      if (seen?.status === 'refund_pending') return seen.type === 'booking_payment_after_cancel' ? ('late' as const) : ('duplicate' as const);
      if (seen) return 'retry' as const;
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, currency: true, status: true } });
      if (!booking) return 'unknown' as const;
      // Paid on a checkout page opened before the booking was cancelled or declined: refund it all.
      if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.REJECTED) {
        await tx.paymentTransaction.create({
          data: {
            user_id: booking.customer_id,
            type: 'booking_payment_after_cancel',
            provider: 'stripe',
            reference_number: session.id,
            status: 'refund_pending',
            amount: (session.amount_total ?? 0) / 100,
            currency: booking.currency ?? session.currency ?? 'usd',
          },
        });
        return 'late' as const;
      }
      // row lock: a concurrent delivery waits here until the other transaction commits
      const claimed = await tx.booking.updateMany({ where: { id: bookingId, paid_at: null }, data: { paid_at: new Date() } });
      if (claimed.count === 0) {
        // re-check after the lock: the same session may have just been recorded by a concurrent delivery
        const recorded = await tx.paymentTransaction.findFirst({ where: { reference_number: session.id } });
        if (recorded?.status === 'refund_pending') return recorded.type === 'booking_payment_after_cancel' ? ('late' as const) : ('duplicate' as const);
        if (recorded) return 'retry' as const;
      }
      await tx.paymentTransaction.create({
        data: {
          user_id: booking.customer_id,
          type: claimed.count === 1 ? 'booking_payment' : 'booking_payment_duplicate',
          provider: 'stripe',
          reference_number: session.id,
          status: claimed.count === 1 ? 'succeeded' : 'refund_pending',
          amount: (session.amount_total ?? 0) / 100,
          currency: booking.currency ?? session.currency ?? 'usd',
        },
      });
      return claimed.count === 1 ? ('paid' as const) : ('duplicate' as const);
    });

    if ((outcome === 'duplicate' || outcome === 'late') && paymentIntentId) {
      await StripePayment.refundPaymentIntent(paymentIntentId, `${outcome}-${session.id}`);
      await this.prisma.paymentTransaction.updateMany({
        where: { reference_number: session.id },
        data: { status: 'refunded' },
      });
    }
    // paid after the vendor already marked the job complete
    if (outcome === 'paid') await this.creditVendorEarnings(bookingId);
  }

  /**
   * Releases the vendor price (not the customer service fee) to the vendor's payout balance, once,
   * less Vendly's commission at the current rate, like a regular payout (`releaseBooking`).
   */
  private async creditVendorEarnings(bookingId: string) {
    const credited = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { status: true, paid_at: true, payout_credited_at: true, amount: true, currency: true, vendor_id: true },
      });
      if (!b?.paid_at || b.payout_credited_at || !b.amount || b.status !== BookingStatus.COMPLETED) return false;
      const gross = round2(Number(b.amount));
      const commission = round2((Math.max(0, gross) * currentFees().commission) / 100);
      const share = round2(gross - commission);
      const now = new Date();
      // released_gross / commission_amount: refunds after the payout are recovered net of commission
      const claimed = await tx.booking.updateMany({
        where: { id: bookingId, payout_credited_at: null },
        data: { payout_credited_at: now, released_at: now, commission_amount: commission, released_gross: gross },
      });
      if (claimed.count !== 1) return false;
      const currency = b.currency ?? 'usd';
      if (commission > 0) {
        await tx.paymentTransaction.create({
          data: { user_id: b.vendor_id, type: 'vendly_commission', provider: 'stripe', reference_number: bookingId, order_id: bookingId, status: 'succeeded', amount: commission, currency },
        });
      }
      if (share > 0) {
        await tx.user.update({ where: { id: b.vendor_id }, data: { balance: { increment: share } } });
        await tx.paymentTransaction.create({
          data: {
            user_id: b.vendor_id,
            type: 'booking_earning',
            provider: 'stripe',
            reference_number: bookingId,
            order_id: bookingId,
            status: 'succeeded',
            amount: share,
            currency,
          },
        });
      }
      return true;
    });
    // the money on this booking is final: the customer gets their invoice
    if (credited) await this.payments.sendFinalInvoice(bookingId).catch((err) => console.error(`Invoice for ${bookingId} failed:`, err));
  }

  async cancel(bookingId: string, userId: string, dto: CancelBookingDto) {
    const booking = await this.getBookingOrFail(bookingId);

    const isCustomer = booking.customer_id === userId;
    const isVendor = booking.vendor_id === userId;
    if (!isCustomer && !isVendor) throw new ForbiddenException('Access denied');
    const by = isCustomer ? 'CUSTOMER' : 'VENDOR';

    // each side picks from its own list; apps from before the lists send none and count as "Other"
    const code = dto.reason_code ?? 'other';
    if (!(code in cancelReasonsFor(by))) throw new BadRequestException('Pick one of the reasons offered for cancelling.');
    if (code === 'customer_didnt_pay') {
      // deposit plans: the customer keeps their 12 hours to pay; the booking is cancelled for them if they don't
      if (payWindowOpen(booking)) {
        throw new BadRequestException(`The customer has until ${await this.deadlineFor(booking.id, booking.payment_due_by!)} to pay. If they don't, the booking is cancelled automatically.`);
      }
      if (!(await this.paymentOverdue(booking))) throw new BadRequestException('You can cancel for non-payment only while a payment on this booking is overdue or has failed.');
    }
    const note = (dto.note ?? dto.reason)?.trim() || undefined;
    return this.cancelAs(booking, by, code, note, userId);
  }

  /**
   * When the vendor may cancel with "Customer didn't pay": a deposit plan's deadline to pay has passed,
   * or a charge towards the price failed (other plans, after their retries). Add-ons, fees and rental
   * deposits don't count, and never while a deposit plan's 12 hours to pay are still running.
   */
  private async paymentOverdue(booking: BookingRow) {
    if (payWindowOpen(booking)) return false;
    if (paymentState(booking)) return true;
    const failed = await this.prisma.bookingInstallment.count({ where: { booking_id: booking.id, status: 'FAILED', kind: 'charge' } });
    return failed > 0;
  }

  /** A deadline worded as the payment emails word it, in the time zone the booking was made in. */
  private async deadlineFor(bookingId: string, at: Date) {
    const contract = await Promise.resolve()
      .then(() => this.prisma.bookingContract.findFirst({ where: { booking_id: bookingId }, orderBy: { version: 'desc' }, select: { merge_data: true } }))
      .catch(() => null);
    return deadlineText(at, (contract?.merge_data as Record<string, unknown> | null)?.timezone as string | undefined);
  }

  /**
   * The job's side of the 12-hour rule (payments/payment-due.ts): a deposit plan booking whose
   * deposit or balance still isn't paid at its deadline is cancelled for non-payment and settled like
   * a customer cancellation (the paid deposit stays with the vendor). Null when there's nothing to do.
   */
  async cancelForNonPayment(bookingId: string, now = new Date()) {
    const booking = await this.getBookingOrFail(bookingId);
    if (!paymentState(booking) || !booking.payment_due_by || booking.payment_due_by > now) return null;
    // Vendly settles a disputed booking itself
    if (booking.dispute_opened_at && !booking.dispute_resolved_at) return null;
    return this.cancelAs(booking, 'SYSTEM', NON_PAYMENT, undefined, null, now);
  }

  private async cancelAs(booking: BookingRow, by: Exclude<CancelledBy, 'ADMIN'>, code: string, note: string | undefined, actorId: string | null, cancelledAt = new Date()) {
    const bookingId = booking.id;
    if (!CANCELLABLE.includes(booking.status))
      throw new BadRequestException(`Cannot cancel a booking in ${booking.status} status`);
    // Vendly settles the money of a disputed booking when it decides
    if (booking.dispute_opened_at && !booking.dispute_resolved_at) throw new BadRequestException(OPEN_DISPUTE);

    // Claim the cancellation atomically so two simultaneous cancels can't both refund.
    const claimed = await this.prisma.booking.updateMany({
      // and no dispute opened since it was loaded; the job only while the payment is still missing
      where: {
        id: bookingId,
        status: { in: CANCELLABLE },
        OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }],
        ...(by === 'SYSTEM' ? { payment_due_by: { lte: cancelledAt } } : {}),
      },
      data: {
        status: BookingStatus.CANCELLED,
        cancelled_at: cancelledAt,
        cancel_reason: note,
        cancelled_by: by,
        cancel_reason_code: code,
        payment_due_by: null,
        payment_due_kind: null,
        payment_due_reminded_at: null,
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('This booking has already been cancelled or completed');
    await this.contracts.voidPendingForBooking(bookingId, 'Booking cancelled', actorId);
    // requested add-ons and fees die with the booking
    await this.prisma.bookingExtra.updateMany({ where: { booking_id: bookingId, status: { in: [BookingExtraStatus.PENDING, BookingExtraStatus.IN_REVIEW] } }, data: { status: BookingExtraStatus.CANCELLED } });

    // a vendor's cancellation for their own reasons refunds everything; one because the customer
    // didn't pay (by the vendor or by Vendly) settles like the customer's
    const cancelledBy = settlementSide(by, code);
    const isCustomer = by === 'CUSTOMER';
    // under the booking's money lock, so a refund or payout already under way finishes first
    let terms: CancellationTerms;
    if (booking.paid_at) {
      terms = await withBookingLock(this.prisma, bookingId, () => this.settlePaidCancellation(booking, cancelledBy, cancelledAt));
    } else {
      // nothing paid yet: still release any card hold (pay-after-service, rental deposit) straight away
      terms = await this.cancellationTerms(booking, cancelledBy, cancelledAt);
      await this.payments.voidOpenCharges(bookingId).catch((err) => console.error(`Voiding charges for cancelled booking ${bookingId} failed:`, err));
    }
    const settlement = booking.paid_at ? terms.settlement : null;
    const updated = await this.getBookingOrFail(bookingId);

    const clientUrl = appConfig().app.client_app_url;
    const title = titleOf(booking) ?? 'Service';
    const card = await this.payments.cardLabel(booking.payment_method_id).catch(() => null);
    const forCustomer = this.describeCancellation(terms, 'CUSTOMER', card, true);
    const reasonText = describeCancelReason({ cancelled_by: by, cancel_reason_code: code, cancel_reason: note });
    const missed = booking.payment_due_kind === 'balance' ? 'balance' : 'deposit';
    const vendorName = booking.vendor?.name ?? 'The vendor';
    const who =
      by === 'CUSTOMER'
        ? 'You cancelled this booking.'
        : by === 'SYSTEM'
          ? `We cancelled this booking because the ${missed} wasn't paid in time.`
          : code === 'customer_didnt_pay'
            ? `${vendorName} cancelled this booking because the payment wasn't made.`
            : `${vendorName} cancelled this booking.`;
    // the vendor let the customer down: offer other vendors free on their date
    const similar = by === 'VENDOR' && code !== 'customer_didnt_pay' ? await this.similarVendorsFor(booking).catch(() => null) : null;
    const offers = similar?.items ?? [];

    // the customer always hears what happens to their money, whoever cancelled
    await this.mailService.sendBookingNotification({
      to: booking.customer.email,
      recipientName: booking.customer.name,
      subject: `Booking cancelled — ${title}`,
      message: `${who} ${forCustomer.message}${offers.length ? ` ${offers.length === 1 ? 'A similar vendor is' : `${offers.length} similar vendors are`} free on your date.` : ''}`,
      status: 'CANCELLED',
      listingTitle: title,
      reason: isCustomer ? undefined : reasonText ?? undefined,
      lines: [
        { label: 'Refund', value: `$${forCustomer.refund_total.toFixed(2)}` },
        ...(forCustomer.refund_total > 0 && card ? [{ label: 'Refunded to', value: card }] : []),
        ...(forCustomer.refund_total > 0 ? [{ label: 'When', value: `Within ${REFUND_TIMING}` }] : []),
        ...(forCustomer.fee_kept > 0 ? [{ label: 'Vendly Protection fee (not refunded)', value: `$${forCustomer.fee_kept.toFixed(2)}` }] : []),
        ...(forCustomer.deposit_kept ? [{ label: 'Deposit (non-refundable)', value: `$${forCustomer.deposit_kept.toFixed(2)}` }] : []),
        ...offers.map((v) => ({ label: 'Free on your date', value: `${v.vendor_name ? `${v.vendor_name}: ` : ''}${v.title}, $${v.price.toFixed(2)}` })),
      ],
      ctaUrl: offers.length ? similar!.url : `${clientUrl}/bookings/${bookingId}`,
      ctaLabel: offers.length ? 'See vendors free on your date' : undefined,
    }).catch(() => null);
    const refundLine = forCustomer.refund_total > 0 && !forCustomer.refund_failed ? `$${forCustomer.refund_total.toFixed(2)} is being refunded to your card (${REFUND_TIMING}).` : null;
    this.pushBooking(
      booking.customer_id,
      bookingId,
      'Booking cancelled',
      offers.length
        ? `${vendorName} cancelled ${title}.${refundLine ? ` ${refundLine}` : ''} Similar vendors are free on your date.`
        : refundLine
          ? `${title}: ${refundLine}`
          : `${title} was cancelled. ${forCustomer.message}`,
    );

    // and the vendor is told when the customer cancelled, or Vendly did because the customer didn't pay
    if (by !== 'VENDOR') {
      const forVendor = this.describeCancellation(terms, 'VENDOR', null, true);
      const vendorWho = by === 'SYSTEM' ? `The booking was cancelled because the customer didn't pay the ${missed} in time.` : 'The booking has been cancelled by the customer.';
      await this.mailService.sendBookingNotification({
        to: booking.vendor.email,
        recipientName: booking.vendor.name,
        subject: `Booking cancelled — ${title}`,
        message: `${vendorWho} ${forVendor.message}`,
        status: 'CANCELLED',
        listingTitle: title,
        reason: reasonText ?? undefined,
        ctaUrl: `${clientUrl}/vendor/bookings/${bookingId}`,
        topic: 'booking_updates',
      }).catch(() => null);
      this.pushBooking(booking.vendor_id, bookingId, 'Booking cancelled', by === 'SYSTEM' ? `${title} was cancelled: the customer didn't pay the ${missed} in time` : `${title} was cancelled by the customer`);
    }

    // money on a paid booking is settled now: the customer gets the final invoice
    if (booking.paid_at) await this.payments.sendFinalInvoice(bookingId).catch((err) => console.error(`Invoice for ${bookingId} failed:`, err));
    // a vendor's cancellation for their own reasons counts towards Vendly's tracking
    if (countsAgainstVendor(by, code)) await this.trackVendorCancellations(booking.vendor_id, cancelledAt).catch((err) => console.error(`Cancellation tracking for ${booking.vendor_id} failed:`, err));

    const viewer = by === 'VENDOR' ? 'VENDOR' : 'CUSTOMER';
    return {
      success: true,
      data: {
        ...this.formatBooking(updated),
        refund: settlement,
        refund_summary: this.describeCancellation(terms, viewer, viewer === 'CUSTOMER' ? card : null, true),
        ...(offers.length ? { similar_vendors: similar } : {}),
      },
    };
  }

  /**
   * After a vendor's own cancellation: from 2 in 90 days Vendly's admins are told, once per 90 days
   * (the search ranking follows the count by itself, see MarketplaceService.searchListings).
   */
  private async trackVendorCancellations(vendorId: string, now = new Date()) {
    const count = (await vendorCancellationCounts(this.prisma, [vendorId], now))[vendorId] ?? 0;
    if (count < TRACK_THRESHOLD) return;
    // test vendors (Admin -> Settings -> Test vendors) are never reported
    const claimed = await this.prisma.user.updateMany({
      where: { id: vendorId, is_test: false, OR: [{ cancellations_alerted_at: null }, { cancellations_alerted_at: { lt: trackWindowStart(now) } }] },
      data: { cancellations_alerted_at: now },
    });
    if (claimed.count !== 1) return;
    const vendor = await this.prisma.user.findUnique({ where: { id: vendorId }, select: { name: true, email: true, vendorProfile: { select: { business_name: true } } } });
    const name = vendor?.vendorProfile?.business_name || vendor?.name || vendor?.email || vendorId;
    const body = `${name} has cancelled ${count} bookings in the last ${TRACK_WINDOW_DAYS} days (not counting non-payment or safety concerns). Their packages show after others in search while that stays at ${TRACK_THRESHOLD} or more.`;
    const admins = await this.prisma.user.findMany({ where: { type: 'ADMIN', deleted_at: null }, select: { id: true, email: true, name: true } });
    for (const a of admins) {
      void this.pushService.sendToUser(a.id, { title: 'Vendor cancelling bookings', body, data: { type: 'vendor_cancellations', vendorId } });
      if (a.email) {
        await this.mailService
          .sendBookingNotification({ to: a.email, recipientName: a.name ?? '', subject: `Vendor cancelling bookings — ${name}`, message: body, status: 'CANCELLED', listingTitle: 'Vendor cancellations', ctaUrl: `${appConfig().app.client_app_url}/dashboard/vendors` })
          .catch(() => null);
      }
    }
  }

  /** Other vendors in the same category free on this booking's (future) date, and the marketplace link for more. */
  private async similarVendorsFor(booking: { id: string; vendor_id: string; event_start_at: Date | null; scheduled_at: Date | null; listing?: { category_id?: string | null } | null }) {
    const start = booking.event_start_at ?? booking.scheduled_at;
    const categoryId = booking.listing?.category_id;
    if (!start || !categoryId || start <= new Date()) return null;
    const contract = await this.prisma.bookingContract.findFirst({ where: { booking_id: booking.id }, orderBy: { version: 'desc' }, select: { merge_data: true } });
    const tz = (contract?.merge_data as Record<string, unknown> | null)?.timezone as string | undefined;
    const date = dayInZone(start, tz);
    const items = await this.marketplace.similarAvailable({ categoryId, date, excludeVendorId: booking.vendor_id, take: 4 });
    const url = `${appConfig().app.client_app_url}/marketplace?category_id=${encodeURIComponent(categoryId)}&date=${date}`;
    return { items, url, category_id: categoryId, date };
  }

  /** What cancelling now would do with the money, worded for whoever asks (customer or vendor). Changes nothing. */
  async cancelPreview(bookingId: string, userId: string, reasonCode?: string) {
    const booking = await this.getBookingOrFail(bookingId);
    const isCustomer = booking.customer_id === userId;
    if (!isCustomer && booking.vendor_id !== userId) throw new ForbiddenException('Access denied');
    if (!CANCELLABLE.includes(booking.status)) throw new BadRequestException(`Cannot cancel a booking in ${booking.status} status`);
    if (booking.dispute_opened_at && !booking.dispute_resolved_at) throw new BadRequestException(OPEN_DISPUTE);
    const by = isCustomer ? 'CUSTOMER' : 'VENDOR';
    const now = new Date();
    // the vendor's "Customer didn't pay" settles like a customer cancellation (offered only while a payment is overdue)
    const nonPayment = !isCustomer && (await this.paymentOverdue(booking));
    const code = reasonCode === 'customer_didnt_pay' && !nonPayment ? undefined : reasonCode;
    const terms = await this.cancellationTerms(booking, settlementSide(by, code), now);
    const card = isCustomer ? await this.payments.cardLabel(booking.payment_method_id).catch(() => null) : null;
    // past the start and never started (maybe a no-show): the policy would pay the vendor, so the
    // apps point the customer to Report a problem first. Cancelling stays possible.
    const reportInstead = isCustomer && !!booking.paid_at && pastStartNotStarted(booking, now);
    return {
      success: true,
      data: {
        ...this.describeCancellation(terms, by, card, false),
        ...(reportInstead && { report_problem_hint: NO_SHOW_HINT }),
        // the reasons this person can pick; "Customer didn't pay" only while a payment is overdue
        reasons: Object.entries(cancelReasonsFor(by))
          .filter(([key]) => key !== 'customer_didnt_pay' || nonPayment)
          .map(([key, label]) => ({ key, label })),
      },
    };
  }

  /**
   * The one calculation behind both the cancel preview and the real cancellation: the policy in the
   * signed contract, add-ons and fees agreed after booking, and (on a payment plan) what was actually
   * paid. Reads only; settlePaidCancellation moves the money.
   */
  private async cancellationTerms(booking: BookingRow, cancelledBy: 'CUSTOMER' | 'VENDOR', cancelledAt: Date): Promise<CancellationTerms> {
    const contract = await this.prisma.bookingContract.findFirst({
      where: { booking_id: booking.id, status: 'EXECUTED' },
      orderBy: { version: 'desc' },
      select: { merge_data: true },
    });
    const policy = (contract?.merge_data as Record<string, unknown> | null)?.cancellation_policy as string | undefined;
    const installments = (await this.prisma.bookingInstallment.findMany({ where: { booking_id: booking.id } })) ?? [];
    const approvedExtras = (await this.prisma.bookingExtra.findMany({ where: { booking_id: booking.id, status: BookingExtraStatus.APPROVED }, select: { kind: true, amount: true } })) ?? [];
    // add-ons agreed after booking are part of the price the policy applies to; agreed fees are the vendor's in full
    const addOnsAfter = approvedExtras.filter((e) => e.kind === AddOnKind.ADD_ON).reduce((s, e) => s + Number(e.amount), 0);
    const feesAgreed = approvedExtras.filter((e) => e.kind === AddOnKind.FEE).reduce((s, e) => s + Number(e.amount), 0);
    const owed = settleCancellation({
      cancelledBy,
      amount: Number(booking.amount ?? 0) + addOnsAfter,
      serviceFee: Number(booking.service_fee ?? 0),
      policy,
      eventStart: booking.event_start_at ?? booking.scheduled_at,
      cancelledAt,
    });
    const paid = !!booking.paid_at;
    const sum = <T>(rows: T[], f: (i: T) => number) => round2(rows.reduce((s, i) => s + f(i), 0));
    // paid in one go through Checkout (no installments): settled as one paid charge, less what was
    // refunded since (a dispute's partial refund), so nothing is refunded or credited twice
    const checkout = paid && !installments.length ? await this.payments.checkoutPart(booking.id, { ...booking, installments }) : null;
    const paidRows: PaidInstallment[] = checkout
      ? [{ status: 'PAID', amount: round2(Number(booking.amount ?? 0) + Number(booking.service_fee ?? 0)), fee_amount: Number(booking.service_fee ?? 0), refunded_amount: checkout.refunded }]
      : installments;
    // settle against what was actually paid: the vendor keeps at most what the customer paid towards
    // their price, and everything else paid comes back. Nothing paid: nothing moves.
    let settlement: Settlement = !paid
      ? { refundTotal: 0, refundVendorPrice: 0, refundFee: 0, vendorKeeps: 0, percent: owed.percent }
      : paidRows.length
        ? settleAgainstPaid(owed, paidRows, cancelledBy, cancelledBy === 'CUSTOMER' ? round2(owed.vendorKeeps + feesAgreed) : 0)
        : owed;
    // deposit plans (bookings under the Oct 2026 rules): the paid deposit is non-refundable when the
    // customer cancels or didn't pay; what was paid beyond it follows the policy (cancellation.ts)
    let depositKept = 0;
    if (paid && installments.length && cancelledBy === 'CUSTOMER' && booking.deposit_rules && isDepositPlan(booking.payment_plan)) {
      const vendorPart = (i: (typeof installments)[number]) => Math.max(0, Number(i.amount) - Number(i.fee_amount) - Number(i.refunded_amount));
      const vendorPaid = sum(installments.filter((i) => i.status === 'PAID'), vendorPart);
      const first = installments.find((i) => i.kind === 'charge' && i.sequence === 1);
      const split = installments.some((i) => i.kind === 'charge' && i.sequence === 2);
      let depositPaid = first?.status === 'PAID' ? round2(vendorPart(first)) : 0;
      // the event was too close to split the price: the deposit's share of the full payment
      if (!split) depositPaid = Math.min(depositPaid, round2(Number(booking.amount ?? 0) * depositShareOf(booking.payment_plan!)));
      const kept = depositPlanVendorOwed({ vendorPaid, depositPaid, feesAgreed, percent: owed.percent });
      settlement = settleAgainstPaid(owed, installments, 'CUSTOMER', kept.owed);
      depositKept = kept.depositKept;
    }

    // charges never taken (rental deposit holds not placed yet aren't charges)
    const unpaid = sum(installments.filter((i) => (i.status === 'SCHEDULED' || i.status === 'FAILED') && i.kind !== 'security_deposit'), (i) => Number(i.amount));
    // card holds let go (voidOpenCharges)
    const holds = sum(installments.filter((i) => i.status === 'PROCESSING' && i.capture_manually && i.payment_intent_id), (i) => Number(i.amount));
    // the Vendly Protection fee paid and still held: kept when the customer cancels
    const feePaid = !paid
      ? 0
      : paidRows.length
        ? sum(paidRows.filter((i) => i.status === 'PAID'), (i) => Math.max(0, Math.min(Number(i.fee_amount), Number(i.amount) - Number(i.refunded_amount))))
        : round2(Number(booking.service_fee ?? 0));
    return {
      cancelledBy,
      depositKept,
      settlement,
      installments,
      policyKey: policy ?? null,
      paid,
      feeKept: cancelledBy === 'CUSTOMER' ? feePaid : 0,
      unpaidCancelled: unpaid,
      holdsReleased: holds,
    };
  }

  /** The API/app shape of cancellation terms, with the plain sentence for `viewer`. */
  private describeCancellation(t: CancellationTerms, viewer: 'CUSTOMER' | 'VENDOR', card: string | null, done: boolean): CancellationSummary {
    const preset = t.policyKey ? CANCELLATION_PRESETS[t.policyKey] : undefined;
    const failed = round2(t.refundFailed ?? 0);
    const summary = {
      cancelled_by: t.cancelledBy,
      // what is actually on its way to the card
      refund_total: round2(t.settlement.refundTotal - failed),
      refund_fee: round2(t.settlement.refundFee),
      fee_kept: t.feeKept,
      vendor_keeps: round2(t.settlement.vendorKeeps),
      ...(t.depositKept > 0 ? { deposit_kept: round2(Math.min(t.depositKept, t.settlement.vendorKeeps)) } : {}),
      policy: preset && t.policyKey ? { key: t.policyKey, label: preset.label, text: preset.text } : null,
      percent: t.settlement.percent,
      unpaid_cancelled: t.unpaidCancelled,
      holds_released: t.holdsReleased,
      card,
      ...(failed > 0 ? { refund_failed: failed } : {}),
    };
    return {
      ...summary,
      refund_timing: summary.refund_total > 0 ? REFUND_TIMING : null,
      message: cancellationMessage({ ...summary, paid: t.paid }, viewer, done),
    };
  }

  /**
   * Refunds a paid booking that was just cancelled and credits the vendor what they keep
   * (rules in ./cancellation.ts, sums in cancellationTerms). A failed Stripe refund is recorded as
   * `refund_failed` for follow-up rather than undoing the cancellation.
   */
  private async settlePaidCancellation(
    booking: BookingRow,
    cancelledBy: 'CUSTOMER' | 'VENDOR',
    cancelledAt: Date,
  ): Promise<CancellationTerms> {
    const terms = await this.cancellationTerms(booking, cancelledBy, cancelledAt);
    const { settlement, installments } = terms;
    const currency = booking.currency ?? 'usd';

    // nothing more is charged, and card holds are let go
    await this.payments.voidOpenCharges(booking.id).catch((err) => console.error(`Voiding charges for cancelled booking ${booking.id} failed:`, err));
    if (settlement.refundTotal > 0 && installments.length > 0) {
      let refunded = 0;
      let error: unknown = null;
      try {
        // a customer's cancellation keeps the Vendly Protection fee (refunds come from the vendor's part)
        refunded = await this.payments.refundBooking(booking.id, settlement.refundTotal, `cancel-${booking.id}`, { keepFees: cancelledBy === 'CUSTOMER' });
      } catch (err) {
        error = err;
        // it can stop part-way through the installments: count what did go back
        const before = round2(installments.reduce((s, i) => s + Number(i.refunded_amount), 0));
        const after = await this.prisma.bookingInstallment.aggregate({ where: { booking_id: booking.id }, _sum: { refunded_amount: true } }).catch(() => null);
        refunded = after ? round2(Number(after._sum?.refunded_amount ?? 0) - before) : 0;
      }
      const left = round2(settlement.refundTotal - refunded);
      if (left > 0) {
        terms.refundFailed = left;
        console.error(`Refund for cancelled booking ${booking.id}: ${left} of ${settlement.refundTotal} could not be refunded`, error ?? '');
        Sentry.captureException(error ?? new Error('Cancellation refund fell short'), { tags: { job: 'cancel-refund' }, extra: { booking_id: booking.id, owed: settlement.refundTotal, unrefunded: left } });
        await this.prisma.paymentTransaction.create({
          data: { user_id: booking.customer_id, type: 'booking_refund', provider: 'stripe', reference_number: `cancel-${booking.id}`, order_id: booking.id, status: 'refund_failed', amount: left, currency },
        });
      }
    } else if (settlement.refundTotal > 0) {
      let status = 'refunded';
      let reference = `cancel-${booking.id}`;
      try {
        const session = booking.payment_transaction_id?.startsWith('cs_')
          ? await StripePayment.retrieveCheckoutSession(booking.payment_transaction_id)
          : null;
        const paymentIntentId =
          typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id;
        if (!paymentIntentId) throw new Error('No payment found to refund');
        const refund = await StripePayment.refundPaymentIntent(paymentIntentId, `cancel-${booking.id}`, settlement.refundTotal);
        reference = refund.id;
      } catch (err) {
        status = 'refund_failed';
        terms.refundFailed = settlement.refundTotal;
        console.error(`Refund for cancelled booking ${booking.id} failed:`, err);
        Sentry.captureException(err, { tags: { job: 'cancel-refund' }, extra: { booking_id: booking.id, owed: settlement.refundTotal, unrefunded: settlement.refundTotal } });
      }
      await this.prisma.paymentTransaction.create({
        data: {
          user_id: booking.customer_id,
          type: 'booking_refund',
          provider: 'stripe',
          reference_number: reference,
          // the booking this refund belongs to (transaction history, invoice)
          order_id: booking.id,
          status,
          amount: settlement.refundTotal,
          currency,
        },
      });
    }

    const early = Number((booking as { early_released_amount?: unknown }).early_released_amount ?? 0);
    const net = Math.round((settlement.vendorKeeps - early) * 100) / 100;
    // the vendor already has their share (a deposit paid out early): settled, nothing to move
    if (net === 0 && settlement.vendorKeeps > 0) {
      await this.prisma.booking.updateMany({ where: { id: booking.id, payout_credited_at: null }, data: { payout_credited_at: new Date() } });
    }
    if (net !== 0) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.booking.updateMany({
          where: { id: booking.id, payout_credited_at: null },
          data: { payout_credited_at: new Date() },
        });
        if (claimed.count !== 1) return;
        // a negative net is a deposit paid out early that the vendor now owes back; it comes off future payouts
        await tx.user.update({ where: { id: booking.vendor_id }, data: { balance: { increment: net } } });
        await tx.paymentTransaction.create({
          data: {
            user_id: booking.vendor_id,
            type: net > 0 ? 'booking_cancellation_earning' : 'payout_recovery',
            provider: 'stripe',
            reference_number: booking.id,
            order_id: booking.id,
            status: 'succeeded',
            amount: net,
            currency,
          },
        });
      });
    }
    return terms;
  }

  async getMyBookingsAsCustomer(
    customerId: string,
    query: { page?: number; limit?: number; status?: BookingStatus; tab?: CustomerBookingTab },
  ) {
    if (query.tab) {
      return this.getPaginatedBookings(
        { customer_id: customerId, AND: [customerTabWhere(query.tab), ...(query.status ? [{ status: query.status }] : [])] },
        query,
        customerTabOrder(query.tab),
      );
    }
    return this.getPaginatedBookings(
      { customer_id: customerId, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  async getMyBookingsAsVendor(
    vendorId: string,
    query: { page?: number; limit?: number; status?: BookingStatus; filter?: VendorBookingFilter },
  ) {
    if (query.filter === 'refunds') {
      // money went back to the customer: a refund on any charge, or the vendor gave some back
      const givenBack = await this.prisma.paymentTransaction.findMany({
        where: { user_id: vendorId, type: 'vendor_give_back', reference_number: { not: null } },
        select: { reference_number: true },
        distinct: ['reference_number'],
      });
      const ids = givenBack.map((t) => t.reference_number).filter((r): r is string => !!r);
      const res = await this.getPaginatedBookings(
        {
          vendor_id: vendorId,
          ...(query.status ? { status: query.status } : {}),
          OR: [{ installments: { some: { refunded_amount: { gt: 0 } } } }, ...(ids.length ? [{ id: { in: ids } }] : [])],
        },
        query,
        [{ updated_at: 'desc' }],
      );
      // how much went back on each: refunded to the card, and how much of it the vendor chose to give
      const pageIds = res.data.map((b) => b.id as string);
      const [refunded, gave] = pageIds.length
        ? await Promise.all([
            this.prisma.bookingInstallment.groupBy({ by: ['booking_id'], where: { booking_id: { in: pageIds } }, _sum: { refunded_amount: true } }),
            this.prisma.paymentTransaction.groupBy({ by: ['reference_number'], where: { user_id: vendorId, type: 'vendor_give_back', reference_number: { in: pageIds } }, _sum: { amount: true } }),
          ])
        : [[], []];
      return {
        ...res,
        data: res.data.map((b): Record<string, any> => ({
          ...b,
          refunded_total: round2(Number(refunded.find((r) => r.booking_id === b.id)?._sum.refunded_amount ?? 0)),
          given_back: round2(Number(gave.find((g) => g.reference_number === b.id)?._sum.amount ?? 0)),
        })),
      };
    }
    if (query.filter === 'complaints') {
      // open complaints first, then the most recent
      return this.getPaginatedBookings(
        { vendor_id: vendorId, ...(query.status ? { status: query.status } : {}), dispute_opened_at: { not: null } },
        query,
        [{ dispute_resolved_at: { sort: 'desc', nulls: 'first' } }, { dispute_opened_at: 'desc' }],
      );
    }
    return this.getPaginatedBookings(
      { vendor_id: vendorId, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  async getBooking(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.customer_id !== userId && booking.vendor_id !== userId)
      throw new ForbiddenException('Access denied');

    const data = this.formatBooking(booking);
    // the customer and the vendor see the dispute photos through short-lived signed links
    data.dispute_photo_urls = disputePhotoUrls(booking.dispute_photos, userId, booking.id);
    data.request_photo_urls = requestPhotoUrls(booking.request_photos, userId, booking.id);
    // the vendor cancelled for their own reasons: the customer sees vendors free on their date
    if (booking.customer_id === userId && booking.status === BookingStatus.CANCELLED && booking.cancelled_by === 'VENDOR' && booking.cancel_reason_code !== 'customer_didnt_pay') {
      data.similar_vendors = await this.similarVendorsFor(booking).catch(() => null);
    }
    // a vendor deciding on a request sees what else they've already agreed to that day
    if (booking.vendor_id === userId && booking.status === BookingStatus.PENDING) {
      data.same_day_bookings = await this.sameDayBookings(booking).catch(() => []);
    }
    // where it happens, and the other side's phone (and the vendor's address) once it's accepted
    Object.assign(data, await trackerDetails(this.prisma, booking, userId));
    return { success: true, data };
  }

  /** The vendor's other confirmed or in-progress bookings on the same day(s), in the customer's time zone. */
  private async sameDayBookings(booking: { id: string; vendor_id: string; event_start_at: Date | null; event_end_at: Date | null; scheduled_at: Date | null }) {
    const start = booking.event_start_at ?? booking.scheduled_at;
    if (!start) return [];
    const contract = await this.prisma.bookingContract.findFirst({ where: { booking_id: booking.id }, orderBy: { version: 'desc' }, select: { merge_data: true } });
    const tz = (contract?.merge_data as Record<string, unknown> | null)?.timezone as string | undefined;
    const { first, last } = eventDays(start, booking.event_end_at, tz);
    const DAY = 24 * 3600 * 1000;
    // a little wider than the days themselves, then exact days in the customer's time zone
    const window = { gte: new Date(first.getTime() - 2 * DAY), lte: new Date(last.getTime() + 2 * DAY) };
    const others = await this.prisma.booking.findMany({
      where: {
        vendor_id: booking.vendor_id,
        id: { not: booking.id },
        deleted_at: null,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        OR: [{ event_start_at: window }, { event_start_at: null, scheduled_at: window }],
      },
      select: { id: true, status: true, event_start_at: true, event_end_at: true, scheduled_at: true, listing: { select: { title: true } } },
      orderBy: { event_start_at: 'asc' },
      take: 20,
    });
    return others
      .filter((o) => {
        const oStart = o.event_start_at ?? o.scheduled_at;
        if (!oStart) return false;
        const d = eventDays(oStart, o.event_end_at, tz);
        return d.first <= last && d.last >= first;
      })
      .map((o) => ({ id: o.id, status: o.status, title: o.listing?.title ?? 'Rental', start_at: o.event_start_at ?? o.scheduled_at, end_at: o.event_end_at }));
  }

  async createCheckoutSession(bookingId: string, customerId: string) {
    const booking = await this.getBookingOrFail(bookingId);

    if (booking.customer_id !== customerId)
      throw new ForbiddenException('Access denied');
    // customers pay after the vendor accepts and signs, never before
    const payable: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];
    if (!payable.includes(booking.status))
      throw new BadRequestException('You can pay once the vendor accepts and signs your booking.');
    if (booking.paid_at) throw new BadRequestException('This booking is already paid.');
    // a booking on a payment plan is charged by its installments; a checkout on top would charge it twice
    const installments = await this.prisma.bookingInstallment.count({ where: { booking_id: bookingId } });
    if (installments > 0) throw new BadRequestException('This booking is paid through its payment schedule. Pay any due payment from the booking.');

    // reuse a checkout that's still open, so two tabs can't create two charges
    if (booking.payment_transaction_id?.startsWith('cs_')) {
      const existing = await StripePayment.retrieveCheckoutSession(booking.payment_transaction_id).catch(() => null);
      if (existing?.status === 'open' && existing.url) {
        return { success: true, data: { checkout_url: existing.url } };
      }
    }
    if (!booking.amount || Number(booking.amount) <= 0)
      throw new BadRequestException('Booking has no payable amount');

    const clientUrl = appConfig().app.client_app_url;
    const successUrl = `${clientUrl}/bookings?payment=success&booking_id=${bookingId}`;
    const cancelUrl = `${clientUrl}/bookings?payment=cancelled&booking_id=${bookingId}`;

    const session = await StripePayment.createCheckoutSessionForBooking({
      amount: Number(booking.amount),
      serviceFee: Number(booking.service_fee ?? 0),
      currency: booking.currency ?? 'usd',
      bookingId: booking.id,
      listingTitle: titleOf(booking) ?? 'Service Booking',
      successUrl,
      cancelUrl,
    });

    // store the session ID so the webhook can reconcile
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { payment_transaction_id: session.id },
    });

    return { success: true, data: { checkout_url: session.url } };
  }

  async uploadProof(
    bookingId: string,
    userId: string,
    photos: Express.Multer.File[],
    notes?: string,
  ) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');
    if (!photos || photos.length === 0)
      throw new BadRequestException('At least one photo is required');

    const fileNames = safeStoredNames(photos, PHOTOS);
    for (const [i, photo] of photos.entries()) await TanvirStorage.put(`proofs/${fileNames[i]}`, photo.buffer);

    const proof = await this.prisma.bookingProof.create({
      data: {
        booking_id: bookingId,
        uploader_id: userId,
        photos: fileNames,
        notes,
      },
    });
    if (userId === booking.vendor_id) await this.payments.onProofUploaded(bookingId, proof.created_at).catch(() => null);

    return {
      success: true,
      data: {
        ...proof,
        photos: fileNames.map((f) => TanvirStorage.url(`proofs/${f}`)),
      },
    };
  }

  async getProofs(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');

    const proofs = await this.prisma.bookingProof.findMany({
      where: { booking_id: bookingId },
      include: {
        uploader: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      data: proofs.map((p) => ({
        ...p,
        photos: (p.photos ?? []).map((f: string) => TanvirStorage.url(`proofs/${f}`)),
        uploader: p.uploader?.avatar
          ? {
              ...p.uploader,
              avatar_url: TanvirStorage.url(`${appConfig().storageUrl.avatar}/${p.uploader.avatar}`),
            }
          : p.uploader,
      })),
    };
  }

  async sendDeliverable(
    bookingId: string,
    vendorId: string,
    files: Express.Multer.File[],
    body: { title: string; message?: string; links?: string | string[] },
  ) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== vendorId) throw new ForbiddenException('Access denied');

    // photos, PDFs, Office documents, zips and videos, by content; never the uploaded name
    const fileNames = safeStoredNames(files, DELIVERABLE_FILES);
    for (const [i, file] of (files ?? []).entries()) await TanvirStorage.put(`deliverables/${fileNames[i]}`, file.buffer);

    let links: string[] = [];
    if (Array.isArray(body.links)) {
      links = body.links;
    } else if (body.links) {
      try { links = JSON.parse(body.links); } catch { links = [body.links]; }
    }
    if (!Array.isArray(links)) links = [];
    // rendered as href / Linking.openURL on clients — block javascript: and other schemes
    links = links.filter((l) => typeof l === 'string' && /^https?:\/\//i.test(l.trim())).map((l) => l.trim());

    const deliverable = await this.prisma.bookingDeliverable.create({
      data: {
        booking_id: bookingId,
        vendor_id: vendorId,
        title: body.title,
        message: body.message,
        files: fileNames,
        links,
      },
    });
    this.pushBooking(booking.customer_id, bookingId, 'New deliverable', body.title);

    return {
      success: true,
      data: {
        ...deliverable,
        files: fileNames.map((f) => TanvirStorage.url(`deliverables/${f}`)),
      },
    };
  }

  async getDeliverables(bookingId: string, userId: string) {
    const booking = await this.getBookingOrFail(bookingId);
    if (booking.vendor_id !== userId && booking.customer_id !== userId)
      throw new ForbiddenException('Access denied');

    const deliverables = await this.prisma.bookingDeliverable.findMany({
      where: { booking_id: bookingId },
      orderBy: { created_at: 'desc' },
    });

    return {
      success: true,
      data: deliverables.map((d) => ({
        ...d,
        files: (d.files ?? []).map((f: string) => TanvirStorage.url(`deliverables/${f}`)),
      })),
    };
  }

  // Admin: get all bookings
  async getAllBookings(query: { page?: number; limit?: number; status?: BookingStatus; from?: Date }) {
    return this.getPaginatedBookings(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.from ? { created_at: { gte: query.from } } : {}),
      },
      query,
    );
  }

  private async getPaginatedBookings(where: any, query: { page?: number; limit?: number }, orderBy: Prisma.BookingOrderByWithRelationInput[] = [{ created_at: 'desc' }]) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const fullWhere = { ...where, deleted_at: null };

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where: fullWhere }),
      this.prisma.booking.findMany({
        where: fullWhere,
        skip,
        take: limit,
        orderBy,
        include: this.bookingIncludes(),
      }),
    ]);

    return {
      success: true,
      data: bookings.map((b) => this.formatBooking(b)),
      meta: { total, page, limit, last_page: Math.ceil(total / limit) },
    };
  }

  private async getBookingOrFail(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, deleted_at: null },
      include: this.bookingIncludes(),
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private bookingIncludes() {
    return {
      customer: { select: { id: true, name: true, avatar: true, email: true } },
      vendor: { select: { id: true, name: true, avatar: true, email: true } },
      // service_at: where it happens; location: the package's public, city-level place; dos and don'ts: the vendor's instructions for using the equipment
      // category name: a venue counts as the vendor's place (booking-place.ts)
      listing: { select: { id: true, title: true, price: true, images: true, category_id: true, service_at: true, location: true, dos: true, donts: true, category: { select: { name: true } } } },
      review: { select: { id: true, rating: true, comment: true } },
      rental_reservations: { select: { id: true, quantity: true, start_date: true, end_date: true, daily_rate: true, status: true, item: { select: { id: true, title: true, images: true, dos: true, donts: true } } } },
      rental_return: true,
      // the planner event this booking is part of (vendors open its run of show and files)
      event_bookings: { select: { event: { select: { id: true, name: true, date: true } } } },
      // on a request: the vendor's suggested changes waiting for the customer (request-changes.ts)
      contracts: { where: { status: BookingContractStatus.AWAITING_CUSTOMER }, select: { id: true } },
    };
  }

  private formatBooking(booking: any) {
    const avatarUrl = (avatar: string | null) =>
      avatar
        ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`)
        : null;

    // the vendor suggested changes and the customer is reviewing them: the request can't expire meanwhile
    const changesWaiting = booking.status === BookingStatus.PENDING && !!booking.contracts?.length;
    return {
      ...booking,
      contracts: undefined,
      changes_waiting: changesWaiting,
      // an open request is declined automatically at this time if the vendor hasn't answered
      request_expires_at: booking.status === BookingStatus.PENDING && booking.created_at && !changesWaiting ? requestExpiresAt(booking) : null,
      // a missed deposit or balance waiting to be paid by payment_due_by: the apps show this label as the status
      payment_state: paymentState(booking),
      payment_state_label: paymentState(booking) ? PAYMENT_STATE_LABELS[paymentState(booking)!] : null,
      payment_due_by: paymentState(booking) ? booking.payment_due_by : null,
      // why it was cancelled, as picked from the list ("Double booked"); the note is cancel_reason
      cancel_reason_label: cancelReasonLabel(booking.cancel_reason_code, booking.cancelled_by),
      // the package customizations chosen, as they were when booked (a later package edit doesn't change them)
      customizations: readChosenOptions(booking.chosen_options),
      chosen_options: undefined,
      options_amount: booking.options_amount != null ? Number(booking.options_amount) : null,
      customer: booking.customer
        ? { ...booking.customer, avatar_url: avatarUrl(booking.customer.avatar) }
        : null,
      vendor: booking.vendor
        ? { ...booking.vendor, avatar_url: avatarUrl(booking.vendor.avatar) }
        : null,
      listing: booking.listing
        ? {
            ...booking.listing,
            images: (booking.listing.images ?? []).map((img: string) =>
              TanvirStorage.url(`listings/${img}`),
            ),
          }
        : booking.rental_reservations?.length
          ? {
              // rentals have no package: the apps show the rented items in its place
              id: null,
              title: rentalTitle(booking.rental_reservations),
              price: Number(booking.amount ?? 0),
              images: booking.rental_reservations.flatMap((r: any) => r.item?.images ?? []).slice(0, 1).map((img: string) => TanvirStorage.url(`rentals/${img}`)),
            }
          : null,
      rental_reservations: booking.rental_reservations?.map((r: any) => ({
        ...r,
        item: r.item ? { ...r.item, images: (r.item.images ?? []).map((img: string) => TanvirStorage.url(`rentals/${img}`)) } : r.item,
      })),
      is_rental: !!booking.rental_reservations?.length,
      // private storage keys stay in the API; getBooking adds signed links
      dispute_photos: undefined,
      dispute_photo_count: booking.dispute_photos?.length ?? 0,
      request_photos: undefined,
      request_photo_count: booking.request_photos?.length ?? 0,
    } as Record<string, any>;
  }
}
