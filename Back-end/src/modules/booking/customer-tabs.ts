import { BookingStatus, Prisma } from 'prisma/generated/client';

/**
 * The customer's bookings tabs, built from the existing statuses:
 * - pending: requests waiting for the vendor
 * - upcoming: confirmed and not started yet
 * - active: in progress, or confirmed and its start time has come (happening now)
 * - complete: done, plus cancelled, declined and expired requests (each labelled in the apps)
 * Every booking is in exactly one tab.
 */
export const CUSTOMER_BOOKING_TABS = ['pending', 'upcoming', 'active', 'complete'] as const;
export type CustomerBookingTab = (typeof CUSTOMER_BOOKING_TABS)[number];

/** Its start is the event start, or the scheduled time for bookings without one. */
const started = (now: Date): Prisma.BookingWhereInput[] => [{ event_start_at: { lte: now } }, { event_start_at: null, scheduled_at: { lte: now } }];
const notStarted = (now: Date): Prisma.BookingWhereInput[] => [
  { event_start_at: { gt: now } },
  { event_start_at: null, scheduled_at: { gt: now } },
  { event_start_at: null, scheduled_at: null },
];

export function customerTabWhere(tab: CustomerBookingTab, now = new Date()): Prisma.BookingWhereInput {
  switch (tab) {
    case 'pending':
      return { status: BookingStatus.PENDING };
    case 'upcoming':
      return { status: BookingStatus.CONFIRMED, OR: notStarted(now) };
    case 'active':
      return { OR: [{ status: BookingStatus.IN_PROGRESS }, { status: BookingStatus.CONFIRMED, OR: started(now) }] };
    case 'complete':
      return { status: { in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.REJECTED] } };
  }
}

/** Soonest first for what's coming up, most recent first for the rest. */
export function customerTabOrder(tab: CustomerBookingTab): Prisma.BookingOrderByWithRelationInput[] {
  if (tab === 'upcoming' || tab === 'active') {
    return [{ event_start_at: { sort: 'asc', nulls: 'last' } }, { scheduled_at: { sort: 'asc', nulls: 'last' } }, { created_at: 'desc' }];
  }
  if (tab === 'complete') return [{ updated_at: 'desc' }];
  return [{ created_at: 'desc' }];
}
