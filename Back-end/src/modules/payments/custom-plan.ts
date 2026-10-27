/**
 * Custom payment plans (owner's ask, Nov 2026: "allow vendors to accept partial payments and send charges
 * when customers agree"). The vendor proposes a schedule for one booking (say $2,000 now, $1,500 on Dec 1
 * and the rest a week before the event), the customer signs to agree, and each part is then charged on its
 * date with the booking's saved card, the way a deposit plan's deposit and balance are.
 *
 * Where it's proposed: on a pending request with Suggest changes (contracts/request-changes.ts), and on a
 * confirmed booking for the payments not made yet (contracts/payment-plans.service.ts, an amendment the
 * customer signs; until then the current plan stays).
 *
 * Rules (chosen for the owner's brief):
 * - 2 to 12 payments that add up exactly to what's still owed: the booking total with the Vendly Protection
 *   fee, less what was paid (on a confirmed booking: the charges not made yet, after any money given back).
 * - Each payment is at least $50, except the last, which may be a smaller remainder (Stripe's $0.50 at least).
 * - The Vendly Protection fee still owed is charged with the first payment, as deposit plans do, so the
 *   first payment is at least the fee plus $50.
 * - Only the first payment can be "when the vendor accepts" (a request) or "now" (a confirmed booking);
 *   every other one has a date. Dates are in the future and each is later than the one before. The last is
 *   due no later than the event start; a pay-after-service package may take payments up to 7 days after
 *   the event ends. Without an event date, payments can be up to a year away.
 * - The booking's first charge is its deposit: non-refundable when the customer cancels or doesn't pay,
 *   like a deposit plan's; anything paid beyond it follows the cancellation policy. On a confirmed booking
 *   whose deposit (or first charge) was already paid, that payment stays the deposit.
 * - A payment that fails goes into the pending-payment window (payment-due.ts): the first as the deposit,
 *   later ones as the balance.
 * - Agreeing cancels the unpaid charges and adds the new ones; paid charges are never touched. A payment
 *   whose date passed before the vendor accepted (or the customer agreed) is charged right away.
 */
import { InstallmentStatus } from 'prisma/generated/enums';
import { money, round2 } from './money-text';
import type { PlannedInstallment } from './payment-schedule';

export const MIN_PLAN_PAYMENTS = 2;
export const MAX_PLAN_PAYMENTS = 12;
/** The smallest payment in a plan, except the last (the remainder). */
export const MIN_PLAN_PAYMENT = 50;
/** Stripe's smallest card charge in USD: the least a last payment can be. */
export const MIN_LAST_PAYMENT = 0.5;
/** A pay-after-service package may take payments this long after the event ends. */
export const PAY_AFTER_GRACE_DAYS = 7;
/** Without an event date, payments can be up to this far away. */
export const NO_DATE_LIMIT_DAYS = 365;

const DAY = 24 * 3600 * 1000;

/** Thrown with a message the vendor can act on. */
export class PaymentPlanError extends Error {}

/** One payment as the vendor enters it: an amount, and a date (none for the first: when accepted / now). */
export interface PlanPaymentInput {
  amount: number;
  due_at?: Date | string | null;
}

/** One agreed payment, as kept on the booking (`custom_payment_plan`) and in the contract. */
export interface CustomPayment {
  label: string;
  /** total charged, fee included */
  amount: number;
  /** the Vendly Protection fee in it */
  fee_amount: number;
  /** ISO time; null = when the vendor accepts (a request) or as soon as the customer agrees (a confirmed booking) */
  due_at: string | null;
}

/** What `Booking.custom_payment_plan` holds. */
export interface CustomPlan {
  /** the package is paid after the service: payments may fall after the event */
  pay_after: boolean;
  payments: CustomPayment[];
}

export interface PlanContext {
  /** what's still owed, fee included */
  owed: number;
  /** the part of `owed` that is the Vendly Protection fee */
  feeOwed: number;
  now?: Date;
  eventStart?: Date | string | null;
  eventEnd?: Date | string | null;
  /** the package is paid after the service */
  payAfter?: boolean;
  /** charges already paid on the booking (they keep their numbers: "Payment 2 of 3") */
  paidCount?: number;
  /** the booking's time zone, for the dates in messages */
  timeZone?: string | null;
}

const cents = (n: number) => Math.round(n * 100);

/** "Sat, Dec 12, 2026" in the booking's time zone. */
export function planDate(d: Date | string, timeZone?: string | null) {
  const fmt = (tz: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
  try {
    return fmt(timeZone || 'UTC');
  } catch {
    return fmt('UTC');
  }
}

/** The latest a plan's last payment can be due. */
export function latestDueAt(ctx: Pick<PlanContext, 'eventStart' | 'eventEnd' | 'payAfter' | 'now'>): Date {
  const start = ctx.eventStart ? new Date(ctx.eventStart) : null;
  if (!start) return new Date((ctx.now ?? new Date()).getTime() + NO_DATE_LIMIT_DAYS * DAY);
  if (!ctx.payAfter) return start;
  const end = ctx.eventEnd ? new Date(ctx.eventEnd) : start;
  return new Date(end.getTime() + PAY_AFTER_GRACE_DAYS * DAY);
}

/** "Payment 2 of 3", the booking's first charge marked as its deposit. */
function labelFor(k: number, n: number, paidCount: number) {
  const label = `Payment ${paidCount + k + 1} of ${paidCount + n}`;
  return k === 0 && paidCount === 0 ? `${label} (deposit)` : label;
}

/**
 * Checks a proposed plan against the rules above and returns the payments as they are kept (labels, the
 * fee on the first). Throws PaymentPlanError with a message the vendor can act on.
 */
export function checkCustomPlan(inputs: PlanPaymentInput[] | null | undefined, ctx: PlanContext): CustomPayment[] {
  const list = inputs ?? [];
  const now = ctx.now ?? new Date();
  const owed = round2(ctx.owed);
  const fee = round2(Math.max(0, ctx.feeOwed));
  const paidCount = ctx.paidCount ?? 0;
  if (list.length < MIN_PLAN_PAYMENTS || list.length > MAX_PLAN_PAYMENTS) throw new PaymentPlanError(`A payment plan has ${MIN_PLAN_PAYMENTS} to ${MAX_PLAN_PAYMENTS} payments.`);
  if (cents(owed) < cents(MIN_PLAN_PAYMENT + MIN_LAST_PAYMENT)) throw new PaymentPlanError(`Only ${money(owed)} is left to pay, which is too little to split.`);

  const latest = latestDueAt({ ...ctx, now });
  let total = 0;
  let previous: Date | null = null;
  const out: CustomPayment[] = [];
  for (const [k, p] of list.entries()) {
    const n = k + 1;
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      throw new PaymentPlanError(`Enter the amount of payment ${n} in dollars and cents.`);
    }
    const last = k === list.length - 1;
    if (k === 0 && fee > 0 && cents(amount) < cents(fee + MIN_PLAN_PAYMENT)) {
      throw new PaymentPlanError(`The first payment includes the Vendly Protection fee of ${money(fee)}, so it must be at least ${money(fee + MIN_PLAN_PAYMENT)}.`);
    }
    if (!last && cents(amount) < cents(MIN_PLAN_PAYMENT)) throw new PaymentPlanError(`Payment ${n} must be at least ${money(MIN_PLAN_PAYMENT)}. Only the last payment can be smaller.`);
    if (last && cents(amount) < cents(MIN_LAST_PAYMENT)) throw new PaymentPlanError(`The last payment must be at least ${money(MIN_LAST_PAYMENT)}.`);

    const raw = p.due_at === '' ? null : p.due_at ?? null;
    let due: Date | null = null;
    if (raw == null) {
      if (k !== 0) throw new PaymentPlanError(`Pick a date for payment ${n}.`);
    } else {
      due = new Date(raw);
      if (Number.isNaN(due.getTime())) throw new PaymentPlanError(`Pick a date for payment ${n}.`);
      if (due <= now) throw new PaymentPlanError(`The date of payment ${n} has passed. Pick a date in the future.`);
      if (previous && due <= previous) throw new PaymentPlanError(`Payment ${n} must be due after payment ${n - 1}.`);
      if (due > latest) {
        throw new PaymentPlanError(
          !ctx.eventStart
            ? `Payments can be due up to ${planDate(latest, ctx.timeZone)}.`
            : ctx.payAfter
              ? `The last payment can be due up to ${PAY_AFTER_GRACE_DAYS} days after the event (${planDate(latest, ctx.timeZone)}).`
              : `The last payment must be due by the event start (${planDate(latest, ctx.timeZone)}).`,
        );
      }
    }
    // "now" / "when accepted" counts as the earliest time for the ordering
    previous = due ?? now;
    total += cents(amount);
    out.push({ label: labelFor(k, list.length, paidCount), amount: round2(amount), fee_amount: k === 0 ? fee : 0, due_at: due ? due.toISOString() : null });
  }
  if (total !== cents(owed)) {
    throw new PaymentPlanError(`The payments add up to ${money(total / 100)}, but ${money(owed)} is ${paidCount ? 'still owed' : 'the total'}. Change them so they add up exactly.`);
  }
  return out;
}

/** `total` split into `count` equal payments, the leftover cents on the first one. */
export function splitEvenly(total: number, count: number): number[] {
  if (count < 1) return [];
  const all = cents(total);
  const each = Math.floor(all / count);
  return Array.from({ length: count }, (_, k) => (k === 0 ? each + (all - each * count) : each) / 100);
}

/** The plan kept on a booking, or null for anything that isn't one. */
export function readCustomPlan(json: unknown): CustomPlan | null {
  const p = json as Partial<CustomPlan> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.payments) || !p.payments.length) return null;
  return {
    pay_after: !!p.pay_after,
    payments: p.payments.map((x) => ({ label: String(x.label), amount: Number(x.amount), fee_amount: Number(x.fee_amount ?? 0), due_at: x.due_at ? String(x.due_at) : null })),
  };
}

/** The plan's total, fee included. */
export const planTotal = (payments: { amount: number }[]) => round2(payments.reduce((s, p) => s + Number(p.amount), 0));

/**
 * The charges a custom plan agreed on a request becomes when the vendor accepts: the first (or any payment
 * whose date has passed meanwhile) due at once. Null when the plan no longer adds up to the booking's total.
 */
export function customRows(json: unknown, total: number, acceptedAt: Date): PlannedInstallment[] | null {
  const plan = readCustomPlan(json);
  if (!plan || cents(planTotal(plan.payments)) !== cents(total)) return null;
  return plan.payments.map((p, k) => ({
    sequence: k + 1,
    label: p.label,
    amount: round2(p.amount),
    fee_amount: round2(p.fee_amount),
    due_at: p.due_at && new Date(p.due_at) > acceptedAt ? new Date(p.due_at) : acceptedAt,
    capture_manually: false,
  }));
}

/** "when the Vendor accepts" / "on signing" or the date, for one payment in the contract and the apps. */
function whenText(p: CustomPayment, first: 'accept' | 'now', timeZone?: string | null) {
  if (p.due_at) return `on ${planDate(p.due_at, timeZone)}`;
  return first === 'accept' ? 'when the Vendor accepts' : 'when this amendment is signed';
}

/**
 * The contract's payment sentence (its `payment_schedule` field) for a custom plan:
 * "The total is paid in 3 payments through Vendly: $2,000.00 when the Vendor accepts; ...".
 */
export function planSentence(payments: CustomPayment[], first: 'accept' | 'now', timeZone?: string | null, currency?: string | null) {
  const parts = payments.map((p) => `${money(p.amount, currency)} ${whenText(p, first, timeZone)}`);
  return `The amount due is paid in ${payments.length} payments through Vendly under the payment plan in Schedule A: ${parts.join('; ')}.`;
}

const SECTION = '### Payment plan';

/**
 * The payment plan as it appears in Schedule A: each payment with its amount and when it's charged, and
 * the deposit rule. Added to (or replacing the plan in) the contract's Schedule A; Schedule A is started
 * when the contract has none.
 */
export function withPaymentPlan(
  schedule: string | null | undefined,
  plan: { payments: CustomPayment[]; first: 'accept' | 'now'; timeZone?: string | null; currency?: string | null; customerRole: string; depositPaid?: boolean },
) {
  const base = (schedule ?? '').split(`\n\n${SECTION}`)[0].trim();
  const lines = [SECTION, `The ${plan.customerRole} pays the amount due in ${plan.payments.length} payments, each charged on its date to the card saved on the booking:`];
  for (const p of plan.payments) lines.push(`- ${p.label}: ${money(p.amount, plan.currency)} ${whenText(p, plan.first, plan.timeZone)}${p.fee_amount > 0 ? ` (includes the Vendly Protection fee of ${money(p.fee_amount, plan.currency)})` : ''}`);
  lines.push(
    '',
    plan.depositPaid
      ? `The payment already made on this booking stays its deposit. The payments above follow the cancellation policy. If a payment fails, the ${plan.customerRole} has the time Vendly gives to pay it, or the booking can be cancelled for non-payment.`
      : `The first payment is the deposit: it is non-refundable if the ${plan.customerRole} cancels or the booking is cancelled for non-payment. The other payments follow the cancellation policy. If a payment fails, the ${plan.customerRole} has the time Vendly gives to pay it, or the booking can be cancelled for non-payment.`,
  );
  const section = lines.join('\n');
  return base ? `${base}\n\n${section}` : `## Schedule A: Payment plan\n\n${section}`;
}

/** A charge row as the plan helpers read it. */
interface ChargeRow {
  id: string;
  kind: string;
  sequence: number;
  status: InstallmentStatus | string;
}

/**
 * A booking's first charge: the deposit of a custom plan. Charges replaced by a plan (CANCELLED) don't
 * count, so after a plan is agreed its first payment is the deposit unless one was already paid.
 */
export function firstCharge<T extends ChargeRow>(installments: T[]): T | undefined {
  return installments
    .filter((i) => i.kind === 'charge' && i.status !== InstallmentStatus.CANCELLED)
    .sort((a, b) => a.sequence - b.sequence)[0];
}

/** True for a charge that was taken (and maybe refunded since): it stays as it is when a plan is agreed. */
export const isPaidCharge = (i: { status: InstallmentStatus | string }) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED;
