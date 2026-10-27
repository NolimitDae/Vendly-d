import { Injectable } from '@nestjs/common';
import { BookingContractStatus, BookingExtraStatus, BookingStatus, InstallmentStatus, RentalReservationStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import appConfig from 'src/config/app.config';
import { MAX_MONTHS, monthKeys, readZone, summariseEarnings } from './dashboard-stats';
import { capPerKind, chatItems, disputeItems, extraItems, MAX_PER_KIND, paymentItems, rentalItems, requestItems, sortAttention, titleOf } from './dashboard-attention';
import { bookingTimeZone, serviceAtOf, stepsOpen } from 'src/modules/booking/booking-tracker';
import { paymentState } from 'src/modules/payments/payment-due';

const DAY = 24 * 3600 * 1000;
/** How many upcoming bookings the dashboard lists. */
export const UPCOMING_LIMIT = 5;

// what each attention row shows: the package (or rented items) and the customer
const named = {
  listing: { select: { title: true } },
  customer: { select: { name: true } },
  rental_reservations: { select: { item: { select: { title: true } } } },
} as const;

@Injectable()
export class VendorDashboardService {
  constructor(private prisma: PrismaService) {}

  /** Business dashboard: earned by month, bookings by status, upcoming, rating and top clients. */
  async stats(vendorId: string, query: { months?: number; tz?: string } = {}, now = new Date()) {
    const months = Math.min(MAX_MONTHS, Math.max(1, Math.floor(Number(query.months) || 12)));
    const zone = readZone(query.tz);
    const keys = monthKeys(months, now, zone);
    const [y, m] = keys[0].split('-').map(Number);
    // a day before the first month, so its local start is covered in any time zone
    const from = new Date(Date.UTC(y, m - 1, 1) - DAY);

    const [byStatus, upcoming, rating, bookings] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { vendor_id: vendorId, deleted_at: null },
        _count: { _all: true },
      }),
      // confirmed bookings still to happen, and ones under way
      this.prisma.booking.count({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
          OR: [
            { status: BookingStatus.IN_PROGRESS },
            {
              status: BookingStatus.CONFIRMED,
              OR: [{ event_start_at: { gte: now } }, { event_start_at: null, scheduled_at: { gte: now } }, { event_start_at: null, scheduled_at: null }],
            },
          ],
        },
      }),
      this.prisma.review.aggregate({ where: { vendor_id: vendorId, deleted_at: null }, _avg: { rating: true }, _count: { _all: true } }),
      // only bookings whose money could have reached the vendor in the window
      this.prisma.booking.findMany({
        where: {
          vendor_id: vendorId,
          OR: [{ released_at: { gte: from } }, { payout_credited_at: { gte: from } }, { cancelled_at: { gte: from } }, { paid_at: { gte: from } }],
        },
        select: {
          id: true,
          status: true,
          amount: true,
          paid_at: true,
          released_at: true,
          payout_credited_at: true,
          cancelled_at: true,
          created_at: true,
          commission_amount: true,
          released_gross: true,
          early_released_amount: true,
          customer_id: true,
          customer: { select: { id: true, name: true, avatar: true } },
          installments: { select: { status: true, amount: true, fee_amount: true, refunded_amount: true, paid_out_at: true } },
        },
      }),
    ]);

    const counts = Object.fromEntries(Object.values(BookingStatus).map((s) => [s, 0])) as Record<BookingStatus, number>;
    for (const row of byStatus) counts[row.status] = row._count._all;
    const earnings = summariseEarnings(bookings, keys, zone);
    const avatarUrl = (avatar: string | null) => (avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`) : null);

    return {
      success: true,
      data: {
        months,
        timezone: zone ?? 'UTC',
        revenue_by_month: earnings.revenue_by_month,
        total_earned: earnings.total_earned,
        bookings: {
          total: Object.values(counts).reduce((s, n) => s + n, 0),
          by_status: counts,
          upcoming,
        },
        rating: {
          average: rating._avg.rating != null ? Math.round(Number(rating._avg.rating) * 10) / 10 : null,
          count: rating._count._all,
        },
        top_clients: earnings.top_clients.map(({ avatar, ...c }) => ({ ...c, avatar_url: avatarUrl(avatar) })),
      },
    };
  }

  /**
   * The dashboard home: what needs the vendor's attention (requests to answer and when they close, the
   * customer's answers to suggested changes, missed or failed payments, open complaints, rentals to check
   * back in, add-ons and fees the customer hasn't answered, unread chats) and the next few bookings with
   * what the "On the day" buttons need.
   */
  async home(vendorId: string, now = new Date()) {
    const mine = { vendor_id: vendorId, deleted_at: null };
    const [pending, payments, disputes, rentals, extras, unread, upcoming] = await Promise.all([
      this.prisma.booking.findMany({
        where: { ...mine, status: BookingStatus.PENDING },
        select: {
          id: true,
          created_at: true,
          request_opened_at: true,
          event_start_at: true,
          ...named,
          // the ones still open, and suggested changes (amendments) with what they were
          contracts: {
            where: { OR: [{ status: { in: [BookingContractStatus.AWAITING_CLIENT, BookingContractStatus.AWAITING_CUSTOMER] } }, { supersedes_id: { not: null } }] },
            select: { status: true, void_reason: true, supersedes_id: true, version: true, merge_data: true },
          },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          ...mine,
          OR: [
            { status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] }, payment_due_by: { not: null } },
            {
              status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] },
              installments: { some: { kind: { not: 'security_deposit' }, OR: [{ status: InstallmentStatus.FAILED }, { status: InstallmentStatus.SCHEDULED, attempts: { gt: 0 }, last_error: { not: null } }] } },
            },
          ],
        },
        take: MAX_PER_KIND,
        select: {
          id: true,
          status: true,
          payment_due_by: true,
          payment_due_kind: true,
          ...named,
          installments: {
            where: { status: { in: [InstallmentStatus.FAILED, InstallmentStatus.SCHEDULED] } },
            orderBy: { sequence: 'asc' },
            select: { status: true, kind: true, label: true, amount: true, attempts: true, last_error: true, due_at: true },
          },
        },
      }),
      this.prisma.booking.findMany({
        where: { ...mine, dispute_opened_at: { not: null }, dispute_resolved_at: null },
        orderBy: { dispute_opened_at: 'asc' },
        take: MAX_PER_KIND,
        select: { id: true, dispute_opened_at: true, dispute_category: true, dispute_vendor_replied_at: true, ...named },
      }),
      // due back, not checked in, and the money not paid out yet (a return can't be recorded after that)
      this.prisma.booking.findMany({
        where: {
          ...mine,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] },
          released_at: null,
          rental_return: { is: null },
          // the last rental day is over (end_date is that day itself, at 00:00 UTC)
          rental_reservations: { some: { status: RentalReservationStatus.ACTIVE, end_date: { lte: new Date(now.getTime() - DAY) } } },
        },
        take: MAX_PER_KIND,
        select: {
          id: true,
          listing: named.listing,
          customer: named.customer,
          rental_reservations: { select: { end_date: true, item: { select: { title: true } } } },
        },
      }),
      this.prisma.bookingExtra.findMany({
        where: { status: BookingExtraStatus.PENDING, booking: { ...mine, status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] } } },
        orderBy: { created_at: 'asc' },
        take: MAX_PER_KIND,
        select: { created_at: true, kind: true, name: true, amount: true, fee_amount: true, booking: { select: { id: true, ...named } } },
      }),
      this.unreadChats(vendorId),
      this.upcoming(vendorId, now),
    ]);

    const all = sortAttention([
      ...requestItems(pending, now),
      ...paymentItems(payments),
      ...disputeItems(disputes),
      ...rentalItems(rentals),
      ...extraItems(extras),
      ...chatItems(unread),
    ]);
    return { success: true, data: { attention: capPerKind(all), upcoming } };
  }

  /** Messages from others since the vendor last read each chat (archived chats left out, as in the inbox). */
  private async unreadChats(vendorId: string) {
    const chats = await this.prisma.participant.findMany({ where: { userId: vendorId, archivedAt: null }, select: { conversationId: true, lastReadAt: true } });
    if (!chats.length) return [];
    const rows = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: { senderId: { not: vendorId }, OR: chats.map((c) => ({ conversationId: c.conversationId, createdAt: { gt: c.lastReadAt ?? new Date(0) } })) },
      _count: { _all: true },
    });
    return rows.map((r) => ({ conversationId: r.conversationId, messages: r._count._all }));
  }

  /** The next accepted bookings (and ones under way), soonest first, with what the day-of buttons need. */
  private async upcoming(vendorId: string, now: Date) {
    const rows = await this.prisma.booking.findMany({
      where: {
        vendor_id: vendorId,
        deleted_at: null,
        OR: [
          { status: BookingStatus.IN_PROGRESS },
          // still to come, or due to have started in the last day and not started yet
          {
            status: BookingStatus.CONFIRMED,
            OR: [{ event_start_at: { gte: new Date(now.getTime() - DAY) } }, { event_start_at: null, scheduled_at: { gte: new Date(now.getTime() - DAY) } }, { event_start_at: null, scheduled_at: null }],
          },
        ],
      },
      orderBy: [{ status: 'desc' }, { event_start_at: { sort: 'asc', nulls: 'last' } }, { scheduled_at: { sort: 'asc', nulls: 'last' } }],
      take: UPCOMING_LIMIT,
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        scheduled_at: true,
        event_start_at: true,
        event_end_at: true,
        venue_address: true,
        payment_due_by: true,
        payment_due_kind: true,
        confirmed_at: true,
        en_route_at: true,
        arrived_at: true,
        checked_in_at: true,
        started_at: true,
        // the customer chose to come to the vendor: Customer arrived, not On my way
        customer_comes: true,
        listing: { select: { id: true, title: true, service_at: true, category: { select: { name: true } } } },
        customer: { select: { id: true, name: true, avatar: true } },
        rental_reservations: { select: { item: { select: { title: true } } } },
      },
    });
    const avatarUrl = (avatar: string | null) => (avatar ? TanvirStorage.url(`${appConfig().storageUrl.avatar}/${avatar}`) : null);
    return Promise.all(
      rows.map(async (b) => {
        const isRental = b.rental_reservations.length > 0;
        // the day-of buttons open on the booking's day (or the day before) in the customer's time zone
        const stepsDay = isRental ? false : b.status === BookingStatus.IN_PROGRESS ? true : stepsOpen(b.event_start_at ?? b.scheduled_at, now, await bookingTimeZone(this.prisma, b.id));
        const { rental_reservations, listing, customer, payment_due_kind, ...rest } = b;
        return {
          ...rest,
          amount: b.amount != null ? Number(b.amount) : null,
          title: titleOf(b),
          listing: listing ? { id: listing.id, title: listing.title, service_at: listing.service_at } : null,
          customer: customer ? { id: customer.id, name: customer.name, avatar_url: avatarUrl(customer.avatar) } : null,
          is_rental: isRental,
          service_at: serviceAtOf(b),
          steps_open: stepsDay,
          payment_state: paymentState({ status: b.status, payment_due_by: b.payment_due_by, payment_due_kind }),
        };
      }),
    );
  }
}
