import { BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { vendorPortion } from './payments.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EarningsInstallment {
  status: InstallmentStatus;
  amount: unknown;
  fee_amount: unknown;
  refunded_amount: unknown;
  paid_out_at: Date | null;
}

export interface EarningsBooking {
  id: string;
  status: BookingStatus;
  amount: unknown;
  paid_at: Date | null;
  released_at: Date | null;
  payout_credited_at: Date | null;
  commission_amount: unknown;
  released_gross: unknown;
  early_released_amount: unknown;
  installments: EarningsInstallment[];
}

export interface BookingEarnings {
  booking_id: string;
  /** released to the vendor (paid out or credited to their Vendly balance), after commission */
  earned: number;
  /** the vendor's part of what the customer paid, not released yet (commission is taken on release) */
  held: number;
  /** Vendly commission taken on this booking, net of any given back with a refund */
  commission: number;
}

const isPaid = (i: { status: InstallmentStatus }) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED;
const ended = (s: BookingStatus) => s === BookingStatus.CANCELLED || s === BookingStatus.REJECTED;

/**
 * What a vendor has earned on one booking, read from its installments with the same rules as the
 * payout (`releaseBooking`, `payOutLateFor`, cancellations):
 * - released booking: each paid-out installment's vendor part less the booking's commission rate
 *   (`commission_amount / released_gross`); paid extras not paid out yet are held.
 * - cancelled / rejected: the vendor keeps what is left of their part after refunds, no commission.
 * - otherwise: a deposit released early is earned, the rest of the vendor's paid part is held.
 * Bookings paid before installments existed use the booking amount.
 */
export function bookingEarnings(b: EarningsBooking): BookingEarnings {
  const paid = b.installments.filter(isPaid);
  let earned = 0;
  let held = 0;
  let commission = 0;

  if (!paid.length && !b.installments.length) {
    // legacy checkout bookings: no installments
    if (b.released_at) {
      commission = Number(b.commission_amount ?? 0);
      earned = Number(b.released_gross ?? 0) - commission;
    } else if (b.payout_credited_at) {
      earned = Number(b.amount ?? 0);
    } else if (b.paid_at && !ended(b.status)) {
      held = Number(b.amount ?? 0);
    }
  } else if (b.released_at) {
    const base = Number(b.released_gross ?? 0);
    const rate = base > 0 ? Number(b.commission_amount ?? 0) / base : 0;
    const paidOut = paid.filter((i) => i.paid_out_at).reduce((s, i) => s + vendorPortion(i), 0);
    commission = round2(paidOut * rate);
    earned = paidOut - commission;
    held = paid.filter((i) => !i.paid_out_at).reduce((s, i) => s + vendorPortion(i), 0);
  } else if (ended(b.status)) {
    earned = paid.reduce((s, i) => s + vendorPortion(i), 0);
  } else {
    const vendorPaid = paid.reduce((s, i) => s + vendorPortion(i), 0);
    const early = Number(b.early_released_amount ?? 0);
    earned = early;
    held = Math.max(0, vendorPaid - early);
  }

  return { booking_id: b.id, earned: round2(Math.max(0, earned)), held: round2(held), commission: round2(commission) };
}

/** Totals over a vendor's bookings; `givenBack` is the sum of their `vendor_give_back` transactions. */
export function vendorEarnings(bookings: EarningsBooking[], givenBack: number) {
  const rows = bookings.map(bookingEarnings);
  const sum = (k: 'earned' | 'held' | 'commission') => round2(rows.reduce((s, r) => s + r[k], 0));
  return {
    earned: sum('earned'),
    held: sum('held'),
    commission: sum('commission'),
    given_back: round2(givenBack),
    bookings: rows,
  };
}
