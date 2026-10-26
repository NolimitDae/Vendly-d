import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingContractStatus, BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { PushService } from 'src/modules/push/push.service';
import { BookingContractsService } from 'src/modules/contracts/booking-contracts.service';
import appConfig from 'src/config/app.config';
import { CLIENT_SIGN_DAYS, EXPIRY_REMINDER_HOURS, REQUEST_EXPIRY_HOURS, REVIEW_REMINDER_HOURS, REVIEW_WINDOW_DAYS, clientSignExpiresAt, hoursFromNow, requestExpiresAt } from './booking-requests';

export const EXPIRED_REASON = 'The vendor didn’t respond in time, so the request was closed. You haven’t been charged.';
export const CLIENT_EXPIRED_REASON = 'The client didn’t co-sign the contract in time, so the request was closed. Nothing was charged.';
export const CHANGES_EXPIRED_REASON = 'The suggested changes weren’t answered before the event, so the request was closed. Nothing was charged.';

const people = { select: { id: true, name: true, email: true } };
const titled = { listing: { select: { title: true } }, customer: people, vendor: people };
const titleOf = (b: { listing?: { title: string } | null }) => b.listing?.title ?? 'your booking';
/**
 * Open requests the vendor can answer: not ones still waiting for a planner's client to co-sign, nor ones
 * whose suggested changes are with the customer (the request's clock is paused then: request-changes.ts).
 */
const answerable = {
  status: BookingStatus.PENDING,
  deleted_at: null,
  contracts: { none: { status: BookingContractStatus.AWAITING_CLIENT } },
  AND: [{ contracts: { none: { status: BookingContractStatus.AWAITING_CUSTOMER } } }],
};
/** Open requests whose suggested changes are waiting for the customer (on a request, only those wait for them). */
const awaitingCustomer = { status: BookingStatus.PENDING, deleted_at: null, contracts: { some: { status: BookingContractStatus.AWAITING_CUSTOMER } } };
/** Open requests still waiting for the planner's client to co-sign (the vendor can't answer them yet). */
const awaitingClient = { status: BookingStatus.PENDING, deleted_at: null, contracts: { some: { status: BookingContractStatus.AWAITING_CLIENT } } };
const BATCH = 200;

/**
 * Hourly housekeeping for bookings: reminds vendors about requests they haven't answered, closes
 * requests nobody answered (or whose client never co-signed), and asks customers how a finished
 * booking went.
 */
@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private push: PushService,
    private contracts: BookingContractsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourly() {
    for (const job of [() => this.remindVendors(), () => this.expireRequests(), () => this.askForReviews()]) {
      await job().catch((err) => this.logger.error(`Booking reminders failed: ${(err as Error).message}`));
    }
  }

  /** Requests a day away from closing, nudged once. */
  async remindVendors(now = new Date()) {
    // could close within the reminder window, and haven't closed yet
    const window = { gte: hoursFromNow(-REQUEST_EXPIRY_HOURS, now), lte: hoursFromNow(EXPIRY_REMINDER_HOURS - REQUEST_EXPIRY_HOURS, now) };
    const open = await this.prisma.booking.findMany({
      where: { ...answerable, expiry_reminded_at: null, OR: [{ request_opened_at: window }, { request_opened_at: null, created_at: window }] },
      include: titled,
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    // requests whose event starts soon close earlier than 72 h; include those too
    const soon = await this.prisma.booking.findMany({
      where: {
        ...answerable,
        expiry_reminded_at: null,
        event_start_at: { gt: hoursFromNow(-24, now), lte: hoursFromNow(EXPIRY_REMINDER_HOURS, now) },
        id: { notIn: open.map((b) => b.id) },
      },
      include: titled,
      orderBy: { event_start_at: 'asc' },
      take: BATCH,
    });
    let sent = 0;
    for (const b of [...open, ...soon]) {
      if (requestExpiresAt(b) <= now) continue; // closes this hour instead
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, expiry_reminded_at: null, status: BookingStatus.PENDING }, data: { expiry_reminded_at: now } });
      if (!claimed.count) continue;
      sent++;
      const hours = Math.max(1, Math.round((requestExpiresAt(b).getTime() - now.getTime()) / 3_600_000));
      void this.push.sendToUser(b.vendor_id, {
        title: 'Request waiting for you',
        body: `${b.customer?.name ?? 'A customer'}’s request for ${titleOf(b)} closes in ${hours} hour${hours === 1 ? '' : 's'}. Accept or decline it.`,
        data: { type: 'booking', bookingId: b.id },
      }, 'reminders');
      if (b.vendor?.email) {
        await this.mail
          .sendBookingNotification({
            to: b.vendor.email,
            recipientName: b.vendor.name ?? 'there',
            subject: `Request closes in ${hours} hour${hours === 1 ? '' : 's'}: ${titleOf(b)}`,
            message: `${b.customer?.name ?? 'A customer'} is waiting to hear from you. If you don’t accept or decline in time, the request closes automatically.`,
            status: 'PENDING',
            listingTitle: titleOf(b),
            ctaUrl: `${appConfig().app.client_app_url}/vendor/bookings/${b.id}`,
            topic: 'reminders',
          })
          .catch(() => null);
      }
    }
    return sent;
  }

  /**
   * Requests nobody answered in time are declined, their unsigned contracts voided and both sides
   * told. So are a planner's requests whose client never co-signed: they close when the event starts
   * (or 14 days after the request without a date).
   */
  async expireRequests(now = new Date()) {
    let expired = 0;
    for (const kind of ['vendor', 'client', 'changes'] as const) {
      // a backlog is worked through in batches so nothing stays open past its time
      for (let round = 0; round < 20; round++) {
        const closed = await this.expireBatch(now, kind);
        expired += closed.expired;
        // stop at the end of the queue, or when a full batch held nothing due (those wait for a later hour)
        if (closed.seen < BATCH || !closed.expired) break;
      }
    }
    return expired;
  }

  private async expireBatch(now: Date, kind: 'vendor' | 'client' | 'changes' = 'vendor') {
    const due = hoursFromNow(-REQUEST_EXPIRY_HOURS, now);
    const candidates = await this.prisma.booking.findMany({
      where:
        kind === 'vendor'
          ? {
              ...answerable,
              // checked precisely below; this just narrows to requests that could be due
              OR: [{ request_opened_at: { lte: due } }, { request_opened_at: null, created_at: { lte: due } }, { event_start_at: { lte: now } }],
            }
          : // suggested changes nobody answered close the request on the same terms as a missing co-signature
            { ...(kind === 'client' ? awaitingClient : awaitingCustomer), OR: [{ event_start_at: { lte: now } }, { event_start_at: null, created_at: { lte: hoursFromNow(-CLIENT_SIGN_DAYS * 24, now) } }] },
      include: titled,
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    let expired = 0;
    for (const b of candidates) {
      if ((kind === 'vendor' ? requestExpiresAt(b) : clientSignExpiresAt(b)) > now) continue;
      // only if the vendor hasn't answered in the meantime
      const closed = await this.prisma.booking.updateMany({
        where: { id: b.id, status: BookingStatus.PENDING },
        data: { status: BookingStatus.REJECTED, reject_reason: kind === 'vendor' ? EXPIRED_REASON : kind === 'client' ? CLIENT_EXPIRED_REASON : CHANGES_EXPIRED_REASON, expired_at: now },
      });
      if (!closed.count) continue;
      expired++;
      const voidReason =
        kind === 'vendor' ? 'Request expired: the vendor didn’t respond in time' : kind === 'client' ? 'Request expired: the client didn’t co-sign in time' : 'Request expired: the suggested changes weren’t answered before the event';
      await this.contracts.voidPendingForBooking(b.id, voidReason, null).catch((err) =>
        this.logger.error(`Voiding contracts for expired ${b.id} failed: ${(err as Error).message}`),
      );
      if (kind === 'client') {
        await this.tellClientExpired(b);
        continue;
      }
      if (kind === 'changes') {
        this.tellChangesExpired(b);
        continue;
      }
      const title = titleOf(b);
      void this.push.sendToUser(b.customer_id, {
        title: 'Request closed',
        body: `${b.vendor?.name ?? 'The vendor'} didn’t respond to your request for ${title} in time. You haven’t been charged.`,
        data: { type: 'booking', bookingId: b.id },
      }, 'booking_updates');
      void this.push.sendToUser(b.vendor_id, {
        title: 'Request closed',
        body: `You didn’t respond to ${b.customer?.name ?? 'a customer'}’s request for ${title} in time, so it was closed.`,
        data: { type: 'booking', bookingId: b.id },
      }, 'booking_updates');
      if (b.customer?.email) {
        await this.mail
          .sendBookingNotification({
            to: b.customer.email,
            recipientName: b.customer.name ?? 'there',
            subject: `Request closed: ${title}`,
            message: `${b.vendor?.name ?? 'The vendor'} didn’t respond in time, so your request was closed. You haven’t been charged, and you can book someone else.`,
            status: 'REJECTED',
            listingTitle: title,
            ctaUrl: `${appConfig().app.client_app_url}/marketplace`,
            topic: 'booking_updates',
          })
          .catch(() => null);
      }
    }
    return { expired, seen: candidates.length };
  }

  /** The planner (the booking's customer) and the vendor hear that a request closed without the client's co-signature. */
  private async tellClientExpired(b: { id: string; customer_id: string; vendor_id: string; listing?: { title: string } | null; customer?: { name: string | null; email: string | null } | null; vendor?: { name: string | null; email: string | null } | null }) {
    const title = titleOf(b);
    void this.push.sendToUser(b.customer_id, {
      title: 'Request closed',
      body: `Your client didn’t co-sign the contract for ${title} in time, so the request was closed. You haven’t been charged.`,
      data: { type: 'booking', bookingId: b.id },
    }, 'booking_updates');
    void this.push.sendToUser(b.vendor_id, {
      title: 'Request closed',
      body: `${b.customer?.name ?? 'The planner'}’s request for ${title} closed: their client didn’t co-sign the contract in time.`,
      data: { type: 'booking', bookingId: b.id },
    }, 'booking_updates');
    if (b.customer?.email) {
      await this.mail
        .sendBookingNotification({
          to: b.customer.email,
          recipientName: b.customer.name ?? 'there',
          subject: `Request closed: ${title}`,
          message: `Your client didn’t co-sign the contract in time, so your request to ${b.vendor?.name ?? 'the vendor'} was closed. You haven’t been charged. You can send a new request, or remove the client from the event so the vendor can answer without their signature.`,
          status: 'REJECTED',
          listingTitle: title,
          ctaUrl: `${appConfig().app.client_app_url}/bookings/${b.id}`,
          topic: 'booking_updates',
        })
        .catch(() => null);
    }
  }

  /** Both sides hear that a request closed while the vendor's suggested changes waited for the customer. */
  private tellChangesExpired(b: { id: string; customer_id: string; vendor_id: string; listing?: { title: string } | null; vendor?: { name: string | null } | null; customer?: { name: string | null } | null }) {
    const title = titleOf(b);
    void this.push.sendToUser(b.customer_id, {
      title: 'Request closed',
      body: `The changes ${b.vendor?.name ?? 'the vendor'} suggested for ${title} weren’t answered before the event, so the request was closed. You haven’t been charged.`,
      data: { type: 'booking', bookingId: b.id },
    }, 'booking_updates');
    void this.push.sendToUser(b.vendor_id, {
      title: 'Request closed',
      body: `${b.customer?.name ?? 'The customer'} didn’t answer your suggested changes for ${title} before the event, so the request was closed.`,
      data: { type: 'booking', bookingId: b.id },
    }, 'booking_updates');
  }

  /** One "how was it?" a couple of days after a booking is done, if there's no review yet. */
  async askForReviews(now = new Date()) {
    const due = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.COMPLETED,
        deleted_at: null,
        review: null,
        review_reminded_at: null,
        review_prompt_dismissed_at: null,
        dispute_opened_at: null,
        completed_at: { lte: hoursFromNow(-REVIEW_REMINDER_HOURS, now), gte: hoursFromNow(-REVIEW_WINDOW_DAYS * 24, now) },
      },
      include: titled,
      take: 200,
    });
    let sent = 0;
    for (const b of due) {
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, review_reminded_at: null }, data: { review_reminded_at: now } });
      if (!claimed.count) continue;
      sent++;
      const vendor = b.vendor?.name ?? 'your vendor';
      void this.push.sendToUser(b.customer_id, {
        title: `How was ${vendor}?`,
        body: `Rate ${titleOf(b)}. It takes a few seconds and helps others choose.`,
        data: { type: 'booking', bookingId: b.id },
      }, 'review_requests');
      if (b.customer?.email) {
        await this.mail
          .sendBookingNotification({
            to: b.customer.email,
            recipientName: b.customer.name ?? 'there',
            subject: `How was ${vendor}?`,
            message: `Tell others how ${titleOf(b)} went. A rating takes a few seconds.`,
            status: 'COMPLETED',
            listingTitle: titleOf(b),
            ctaUrl: `${appConfig().app.client_app_url}/bookings/${b.id}`,
            topic: 'review_requests',
          })
          .catch(() => null);
      }
    }
    return sent;
  }
}
