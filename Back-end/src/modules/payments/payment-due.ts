import { BookingStatus, PaymentPlan } from 'prisma/generated/enums';

/**
 * Deposit plans (DEPOSIT_50 / DEPOSIT_25, owner's rules of Oct 2026): when the deposit or the balance
 * charge fails for any reason, the customer has 12 hours to pay it (the saved card again or another
 * card). The charge is retried once on its own about 6 hours in, the customer is reminded with about
 * 2 hours left, and an unpaid booking is then cancelled for non-payment (booking/payment-deadlines.service.ts).
 * Full payment on accept and pay after service keep the 3 tries over 48 hours (payment-schedule.ts).
 * Bookings made before these rules (`deposit_rules` false) keep the old ones.
 * Large bookings (total at or above Admin → Settings "large booking", $5,000 by default; owner, Nov 2026)
 * get 48 hours instead: the retry about 24 hours in, the reminder with about 6 hours left.
 */
export const PAYMENT_DUE_HOURS = 12;
export const PAYMENT_AUTO_RETRY_HOURS = 6;
export const PAYMENT_DUE_REMINDER_HOURS = 2;
export const LARGE_PAYMENT_DUE_HOURS = 48;
export const LARGE_PAYMENT_AUTO_RETRY_HOURS = 24;
export const LARGE_PAYMENT_DUE_REMINDER_HOURS = 6;

export interface PaymentDueRules {
  /** hours to pay from the first failure */
  dueHours: number;
  /** the one automatic retry, this long after the failure */
  retryHours: number;
  /** the reminder, when this many hours are left */
  reminderHours: number;
}

/** The deadline rules for a booking: 12 hours, or 48 for a large one. */
export const paymentDueRules = (large: boolean): PaymentDueRules =>
  large
    ? { dueHours: LARGE_PAYMENT_DUE_HOURS, retryHours: LARGE_PAYMENT_AUTO_RETRY_HOURS, reminderHours: LARGE_PAYMENT_DUE_REMINDER_HOURS }
    : { dueHours: PAYMENT_DUE_HOURS, retryHours: PAYMENT_AUTO_RETRY_HOURS, reminderHours: PAYMENT_DUE_REMINDER_HOURS };

const HOUR = 3600 * 1000;

export type PaymentDueKind = 'deposit' | 'balance';
export type PaymentState = 'pending_deposit' | 'pending_balance';

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  pending_deposit: 'Pending deposit',
  pending_balance: 'Pending balance',
};

export const isDepositPlan = (plan: PaymentPlan | string | null | undefined) => plan === PaymentPlan.DEPOSIT_50 || plan === PaymentPlan.DEPOSIT_25;

/**
 * Which payment of a deposit plan an installment is: the first charge is the deposit (or, when the
 * event was too close to split it, the full payment that includes it), the second the balance.
 * Null for other plans, add-ons, fees and rental holds, and for bookings made under the old rules.
 */
export function dueKindFor(
  booking: { payment_plan?: PaymentPlan | string | null; deposit_rules?: boolean | null },
  inst: { kind: string; sequence: number; first?: boolean },
): PaymentDueKind | null {
  // a custom plan (custom-plan.ts): its first charge is the deposit, every later one a balance payment
  if (booking.payment_plan === PaymentPlan.CUSTOM) return inst.kind === 'charge' ? (inst.first ? 'deposit' : 'balance') : null;
  if (!booking.deposit_rules || !isDepositPlan(booking.payment_plan) || inst.kind !== 'charge') return null;
  if (inst.sequence === 1) return 'deposit';
  if (inst.sequence === 2) return 'balance';
  return null;
}

/**
 * The charge a booking's pending-payment window is waiting for: a deposit plan's deposit (sequence 1) or
 * balance (sequence 2); on a custom plan its first charge for the deposit, or the later payment that didn't
 * go through (failed, or waiting for its retry). Undefined when nothing is waiting any more.
 */
export function dueInstallment<T extends { sequence: number; status: string; attempts?: number }>(
  b: { payment_plan?: PaymentPlan | string | null; payment_due_kind?: string | null },
  charges: T[],
): T | undefined {
  if (b.payment_plan !== PaymentPlan.CUSTOM) return charges.find((i) => i.sequence === (b.payment_due_kind === 'balance' ? 2 : 1));
  const live = charges.filter((i) => i.status !== 'CANCELLED').sort((x, y) => x.sequence - y.sequence);
  if (b.payment_due_kind !== 'balance') return live[0];
  return live.slice(1).find((i) => i.status === 'FAILED' || i.status === 'PROCESSING' || (i.status === 'SCHEDULED' && (i.attempts ?? 0) > 0));
}

/** When a missed payment first noticed at `failedAt` must be paid by (12 hours, or `hours`). */
export const paymentDueBy = (failedAt: Date, hours = PAYMENT_DUE_HOURS) => new Date(failedAt.getTime() + hours * HOUR);

/** The one automatic retry, when it still lands well before the deadline; null when there's no time for it. */
export function autoRetryAt(now: Date, dueBy: Date, retryHours = PAYMENT_AUTO_RETRY_HOURS): Date | null {
  const at = new Date(now.getTime() + retryHours * HOUR);
  return at.getTime() <= dueBy.getTime() - HOUR ? at : null;
}

/** The label the apps show instead of the status while a missed payment is waiting: "Pending deposit". */
export function paymentState(b: { status: BookingStatus | string; payment_due_by?: Date | string | null; payment_due_kind?: string | null }): PaymentState | null {
  if (!b.payment_due_by || (b.status !== BookingStatus.CONFIRMED && b.status !== BookingStatus.IN_PROGRESS)) return null;
  if (b.payment_due_kind === 'deposit') return 'pending_deposit';
  if (b.payment_due_kind === 'balance') return 'pending_balance';
  return null;
}

/** "9:30 PM EDT on Sat, Oct 24" in the customer's time zone (the one their booking was made in). */
export function deadlineText(at: Date, timeZone?: string | null) {
  const fmt = (tz: string) => {
    const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' });
    const day = at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
    return `${time} on ${day}`;
  };
  try {
    return fmt(timeZone || 'UTC');
  } catch {
    // an unknown zone name
    return fmt('UTC');
  }
}
