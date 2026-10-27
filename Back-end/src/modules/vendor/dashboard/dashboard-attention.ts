import { BookingContractStatus, BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { requestExpiresAt } from 'src/modules/booking/booking-requests';
import { readProposal } from 'src/modules/contracts/request-changes';

/**
 * The vendor dashboard's "Needs your attention" list (website, Nov 2026): everything waiting on the vendor,
 * or on the customer when the vendor will want to follow up, each pointing at the booking (or chat) to open.
 * Pure functions here so the rules can be unit tested; VendorDashboardService loads the rows.
 */

export type AttentionKind =
  // a booking request to accept or decline before it closes
  | 'request'
  // the customer approved the vendor's suggested changes: accept to confirm
  | 'changes_approved'
  // the customer declined them: the original request stands, still to answer
  | 'changes_declined'
  // a missed deposit or balance, or a charge that failed
  | 'payment'
  // a customer's complaint that isn't resolved yet
  | 'dispute'
  // rented items due back that haven't been checked in
  | 'rental_return'
  // an add-on or fee sent after booking that the customer hasn't answered
  | 'extra_waiting'
  // chats with messages the vendor hasn't read
  | 'unread_chats';

export interface AttentionItem {
  kind: AttentionKind;
  /** the booking to open (null for unread chats) */
  booking_id: string | null;
  /** the package (or rented items) */
  title: string | null;
  customer_name: string | null;
  /** request: when it closes; payment: when it must be paid by; rental: when it was due back; dispute: opened; extra: sent */
  at: Date | null;
  /** payment: deposit | balance | the charge's label; extra: its name; dispute: the category */
  detail?: string | null;
  amount?: number | null;
  /** dispute: the vendor already replied; payment: the charge is being tried again */
  done?: boolean;
  /** unread chats: chats and messages */
  chats?: number;
  messages?: number;
}

/** What each list is capped at, so a busy vendor still gets a short page. */
export const MAX_PER_KIND = 20;

/** The order kinds are listed in: what closes soonest or costs money first. */
const KIND_ORDER: AttentionKind[] = ['request', 'changes_approved', 'changes_declined', 'payment', 'dispute', 'rental_return', 'extra_waiting', 'unread_chats'];

// the reasons RequestChangesService voids a suggestion with
const DECLINED_BY_CUSTOMER = 'Declined by the customer';

type Named = { listing?: { title: string } | null; customer?: { name: string | null } | null; rental_reservations?: { item?: { title: string } | null }[] };

/** The package, or the rented items for a rental. */
export function titleOf(b: Named): string | null {
  if (b.listing?.title) return b.listing.title;
  const items = (b.rental_reservations ?? []).map((r) => r.item?.title).filter((t): t is string => !!t);
  if (!items.length) return null;
  return items.length === 1 ? items[0] : `${items[0]} and ${items.length - 1} more`;
}

const base = (b: Named & { id: string }) => ({ booking_id: b.id, title: titleOf(b), customer_name: b.customer?.name ?? null });

export interface PendingRow extends Named {
  id: string;
  created_at: Date;
  request_opened_at: Date | null;
  event_start_at: Date | null;
  /** the contracts still open, plus the latest suggestion (any status) */
  contracts: { status: BookingContractStatus | string; void_reason: string | null; supersedes_id: string | null; version: number; merge_data: unknown }[];
}

/**
 * Open requests the vendor can answer, with when each closes. Ones waiting for a planner's client to
 * co-sign, or whose suggested changes are with the customer, aren't the vendor's to answer yet.
 */
export function requestItems(rows: PendingRow[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const b of rows) {
    const open = (s: BookingContractStatus) => b.contracts.some((c) => c.status === s);
    if (open(BookingContractStatus.AWAITING_CLIENT) || open(BookingContractStatus.AWAITING_CUSTOMER)) continue;
    const closes = requestExpiresAt(b);
    // closes within the hour on its own
    if (closes <= now) continue;
    const latest = [...b.contracts].sort((x, y) => y.version - x.version).find((c) => c.supersedes_id && readProposal(c.merge_data));
    const kind: AttentionKind =
      latest?.status === BookingContractStatus.AWAITING_VENDOR
        ? 'changes_approved'
        : latest?.status === BookingContractStatus.VOID && latest.void_reason === DECLINED_BY_CUSTOMER
          ? 'changes_declined'
          : 'request';
    items.push({ kind, ...base(b), at: closes });
  }
  return items;
}

export interface PaymentRow extends Named {
  id: string;
  status: BookingStatus | string;
  payment_due_by: Date | null;
  payment_due_kind: string | null;
  installments: { status: InstallmentStatus | string; kind: string; label: string; amount: unknown; attempts: number; last_error: string | null; due_at: Date }[];
}

/**
 * Money the customer still owes after a charge didn't go through: a missed deposit or balance with its
 * pay-by time, or another charge (an add-on, a fee, a full payment) that failed or is being retried.
 * Rental security holds are left out (they're never charged on their own).
 */
export function paymentItems(rows: PaymentRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const b of rows) {
    const live = b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.IN_PROGRESS;
    if (live && b.payment_due_by && (b.payment_due_kind === 'deposit' || b.payment_due_kind === 'balance')) {
      items.push({ kind: 'payment', ...base(b), at: b.payment_due_by, detail: b.payment_due_kind });
      continue;
    }
    const failed = b.installments.find(
      (i) => i.kind !== 'security_deposit' && (i.status === InstallmentStatus.FAILED || (i.status === InstallmentStatus.SCHEDULED && i.attempts > 0 && !!i.last_error)),
    );
    if (!failed) continue;
    items.push({ kind: 'payment', ...base(b), at: failed.due_at, detail: failed.label, amount: Number(failed.amount), done: failed.status === InstallmentStatus.SCHEDULED });
  }
  return items;
}

export interface DisputeRow extends Named {
  id: string;
  dispute_opened_at: Date | null;
  dispute_category: string | null;
  dispute_vendor_replied_at: Date | null;
}

export const disputeItems = (rows: DisputeRow[]): AttentionItem[] =>
  rows.map((b) => ({ kind: 'dispute', ...base(b), at: b.dispute_opened_at, detail: b.dispute_category, done: !!b.dispute_vendor_replied_at }));

export interface RentalRow extends Named {
  id: string;
  rental_reservations: { end_date: Date; item?: { title: string } | null }[];
}

/** Rentals past their return date with no return recorded yet. */
export const rentalItems = (rows: RentalRow[]): AttentionItem[] =>
  rows.map((b) => ({ kind: 'rental_return', ...base(b), at: new Date(Math.min(...b.rental_reservations.map((r) => new Date(r.end_date).getTime()))) }));

export interface ExtraRow {
  created_at: Date;
  kind: string;
  name: string;
  amount: unknown;
  fee_amount: unknown;
  booking: Named & { id: string };
}

/** Add-ons and fees sent after booking that the customer hasn't approved or declined. */
export const extraItems = (rows: ExtraRow[]): AttentionItem[] =>
  rows.map((e) => ({ kind: 'extra_waiting', ...base(e.booking), at: e.created_at, detail: e.name, amount: Number(e.amount) }));

/** One row for all unread chats, or none. */
export function chatItems(unread: { conversationId: string; messages: number }[]): AttentionItem[] {
  const withUnread = unread.filter((u) => u.messages > 0);
  if (!withUnread.length) return [];
  return [{ kind: 'unread_chats', booking_id: null, title: null, customer_name: null, at: null, chats: withUnread.length, messages: withUnread.reduce((n, u) => n + u.messages, 0) }];
}

/** All the lists in one, most urgent kind first; requests by when they close, the rest oldest first. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  const rank = (k: AttentionKind) => KIND_ORDER.indexOf(k);
  const time = (i: AttentionItem) => (i.at ? new Date(i.at).getTime() : 0);
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind) || time(a) - time(b));
}

/** Caps each kind at MAX_PER_KIND. */
export function capPerKind(items: AttentionItem[]): AttentionItem[] {
  const seen = new Map<AttentionKind, number>();
  return items.filter((i) => {
    const n = (seen.get(i.kind) ?? 0) + 1;
    seen.set(i.kind, n);
    return n <= MAX_PER_KIND;
  });
}
