import { BookingContractStatus, BookingStatus, Prisma } from 'prisma/generated/client';

/**
 * Vendor inbox tabs (owner's ask, Oct 2026: "sort actual clients and current bookings, and another
 * for inquiries"), so a busy vendor's inbox doesn't get flooded:
 * - clients: the other person has a booking or booking request with this vendor (pending, confirmed,
 *   in progress, completed; a cancelled one only if it had been accepted first). Event group chats
 *   are always here, since a vendor only joins one after accepting a booking for it.
 * - inquiries: everyone else.
 * Worked out from the bookings on every request, so a chat moves to Clients the moment that
 * customer sends a booking request.
 */
export const INBOX_TABS = ['clients', 'inquiries'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

/** Bookings still under way: these clients are listed first. */
export const CURRENT_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];

const ACCEPTED_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED];

/**
 * A cancelled booking that the vendor had accepted first. No accepted-at date is kept, but accepting
 * always leaves a trace: an executed contract, a payment schedule or a payment.
 */
const WAS_ACCEPTED: Prisma.BookingWhereInput = {
  status: BookingStatus.CANCELLED,
  OR: [{ paid_at: { not: null } }, { installments: { some: {} } }, { contracts: { some: { status: BookingContractStatus.EXECUTED } } }],
};

/** Bookings the vendor has accepted (confirmed or later, or cancelled after accepting). */
export const acceptedBookingWhere: Prisma.BookingWhereInput = {
  deleted_at: null,
  OR: [{ status: { in: ACCEPTED_STATUSES } }, WAS_ACCEPTED],
};

/** Bookings that make the customer one of the vendor's clients. */
export const clientBookingWhere: Prisma.BookingWhereInput = {
  deleted_at: null,
  OR: [{ status: { in: [BookingStatus.PENDING, ...ACCEPTED_STATUSES] } }, WAS_ACCEPTED],
};

export type InboxClass = { tab: InboxTab; current: boolean };

/**
 * Which tab a conversation goes in for the vendor. `counterpart` is the customer in it (the other
 * person in a 1:1 chat, the planner in an event chat); `statuses` maps each client to the statuses
 * of their client bookings with this vendor.
 */
export function classifyConversation(
  conv: { is_group: boolean; counterpart: string | null },
  statuses: Map<string, BookingStatus[]>,
): InboxClass {
  const mine = (conv.counterpart && statuses.get(conv.counterpart)) || [];
  const current = mine.some((s) => CURRENT_BOOKING_STATUSES.includes(s));
  if (conv.is_group || mine.length) return { tab: 'clients', current };
  return { tab: 'inquiries', current: false };
}
