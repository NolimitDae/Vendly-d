/**
 * Custom payment plans: the vendor splits what's owed into 2 to 12 payments with dates; the customer signs
 * to agree. The server checks every rule again (Back-end/src/modules/payments/custom-plan.ts); these helpers
 * drive the editor (split evenly, add a payment, the running remainder) and the schedule lists.
 */
import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfDay } from 'date-fns';

/** Matches the server's rules. */
export const MIN_PLAN_PAYMENTS = 2;
export const MAX_PLAN_PAYMENTS = 12;
export const MIN_PLAN_PAYMENT = 50;
export const MIN_LAST_PAYMENT = 0.5;

/** One payment as the vendor edits it: the amount, and a day (none on the first = when accepted / now). */
export interface PlanDraftRow {
  key: string;
  amount: string;
  date: Date | null;
}

/** One payment as the server shows it (a proposal, or the booking's charges with their status). */
export interface PlanRow {
  label: string;
  amount: number;
  due_at: string | null;
  status: string | null;
}

/** The payment plan state of a confirmed booking (GET /bookings/:id/payment-plan). */
export interface PaymentPlanState {
  role: 'VENDOR' | 'CUSTOMER';
  plan: string | null;
  payments: PlanRow[];
  can_propose: boolean;
  cannot_propose_reason: string | null;
  rules: { owed: number; fee_owed: number; paid_count: number; min_payments: number; max_payments: number; min_payment: number; latest_due_at: string; event_start_at: string | null; pay_after: boolean } | null;
  proposal: {
    contract_id: string;
    status: 'WAITING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
    sent_at: string;
    vendor_name: string;
    note: string | null;
    owed: number;
    before: PlanRow[];
    after: PlanRow[];
    content_sha256: string;
  } | null;
  consent_text: string;
}

let seq = 0;
const nextKey = () => `p${(seq++).toString(36)}`;
const cents = (n: number) => Math.round(n * 100);
export const money = (n: number | null | undefined) => '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => format(d, 'yyyy-MM-dd');

/** `total` in `count` equal payments, the leftover cents on the first. */
export function splitEvenly(total: number, count: number): number[] {
  if (count < 1) return [];
  const all = cents(total);
  const each = Math.floor(all / count);
  return Array.from({ length: count }, (_, k) => (k === 0 ? each + (all - each * count) : each) / 100);
}

/** Days spread evenly from tomorrow to `last` (the event, or the latest a payment can be due). */
export function spreadDates(count: number, last: string | null | undefined, today = new Date()): (Date | null)[] {
  const from = startOfDay(addDays(today, 1));
  const end = last ? parseISO(last) : addDays(today, count * 30);
  const span = Math.max(0, differenceInCalendarDays(end, from));
  return Array.from({ length: count }, (_, k) => (k === 0 ? null : addDays(from, Math.round((span * k) / Math.max(1, count - 1)))));
}

/** A starting plan: two equal payments, the first when accepted and the second a week before the event (or a month away). */
export function startingPlan(total: number, eventStart: string | null | undefined, today = new Date()): PlanDraftRow[] {
  const [a, b] = splitEvenly(total, 2);
  const second = eventStart ? addDays(parseISO(eventStart), -7) : addDays(today, 30);
  const tomorrow = startOfDay(addDays(today, 1));
  return [
    { key: nextKey(), amount: a.toFixed(2), date: null },
    { key: nextKey(), amount: b.toFixed(2), date: second > tomorrow ? startOfDay(second) : tomorrow },
  ];
}

/** Every payment equal again, keeping the dates; empty dates are filled in up to `last`. */
export function evenRows(rows: PlanDraftRow[], total: number, last?: string | null): PlanDraftRow[] {
  const amounts = splitEvenly(total, rows.length);
  const dates = spreadDates(rows.length, last);
  return rows.map((r, k) => ({ ...r, amount: amounts[k].toFixed(2), date: k === 0 ? r.date : r.date ?? dates[k] }));
}

/** What's still to place: positive when the payments come to less than the total. */
export function remainder(rows: PlanDraftRow[], total: number) {
  return (cents(total) - rows.reduce((s, r) => s + cents(Number(r.amount) || 0), 0)) / 100;
}

/** One more payment, for whatever is still left, a week after the last date. */
export function addRow(rows: PlanDraftRow[], total: number): PlanDraftRow[] {
  const left = Math.max(0, remainder(rows, total));
  const last = [...rows].reverse().find((r) => r.date)?.date;
  return [...rows, { key: nextKey(), amount: left > 0 ? left.toFixed(2) : '', date: last ? addDays(last, 7) : null }];
}

/** "Sat, Dec 5, 2026" */
export const planDate = (iso: string | Date | null | undefined) => (iso ? format(typeof iso === 'string' ? parseISO(iso) : iso, 'EEE, MMM d, yyyy') : '');

/** The first thing to fix in a plan, or null. `feeOwed` is charged with the first payment; `latest` is the last day a payment can be due. */
export function planError(rows: PlanDraftRow[], total: number, opts: { feeOwed?: number; latest?: string | null; today?: Date } = {}): string | null {
  const today = day(opts.today ?? new Date());
  if (rows.length < MIN_PLAN_PAYMENTS || rows.length > MAX_PLAN_PAYMENTS) return `A payment plan has ${MIN_PLAN_PAYMENTS} to ${MAX_PLAN_PAYMENTS} payments.`;
  let previous = '';
  for (const [k, r] of rows.entries()) {
    const n = k + 1;
    const a = Number(r.amount);
    if (r.amount.trim() === '' || !(a > 0) || Math.abs(a * 100 - Math.round(a * 100)) > 1e-6) return `Enter the amount of payment ${n} in dollars and cents.`;
    const last = k === rows.length - 1;
    const fee = opts.feeOwed ?? 0;
    if (k === 0 && fee > 0 && cents(a) < cents(fee + MIN_PLAN_PAYMENT)) return `The first payment includes the Vendly Protection fee of ${money(fee)}, so it must be at least ${money(fee + MIN_PLAN_PAYMENT)}.`;
    if (!last && cents(a) < cents(MIN_PLAN_PAYMENT)) return `Payment ${n} must be at least ${money(MIN_PLAN_PAYMENT)}. Only the last payment can be smaller.`;
    if (last && cents(a) < cents(MIN_LAST_PAYMENT)) return `The last payment must be at least ${money(MIN_LAST_PAYMENT)}.`;
    if (!r.date) {
      if (k !== 0) return `Pick a date for payment ${n}.`;
      continue;
    }
    const d = day(r.date);
    if (d <= today) return `Payment ${n} must be due after today.`;
    if (previous && d <= previous) return `Payment ${n} must be due after payment ${n - 1}.`;
    if (opts.latest && d > day(parseISO(opts.latest))) return `The last payment can be due up to ${planDate(opts.latest)}.`;
    previous = d;
  }
  const left = remainder(rows, total);
  if (left !== 0) return left > 0 ? `${money(left)} still to place. The payments must add up to ${money(total)}.` : `The payments are ${money(-left)} over ${money(total)}.`;
  return null;
}

/** The plan as the API takes it. A day is charged at 9 AM local time; on the event day never later than the event start. */
export function planPayload(rows: PlanDraftRow[], eventStart?: string | null) {
  return {
    payments: rows.map((r) => {
      if (!r.date) return { amount: Number(r.amount) };
      const at = new Date(r.date);
      at.setHours(9, 0, 0, 0);
      const start = eventStart ? parseISO(eventStart) : null;
      const due = start && at > start && isSameDay(start, at) ? start : at;
      return { amount: Number(r.amount), due_at: due.toISOString() };
    }),
  };
}

/** A payment's status in plain words. Unknown ones (newer servers) are shown as they come, tidied up. */
export function paymentStatusText(status: string | null | undefined) {
  switch (status) {
    case null:
    case undefined:
      return 'Proposed';
    case 'SCHEDULED':
      return 'Scheduled';
    case 'PAID':
      return 'Paid';
    case 'FAILED':
      return 'Failed, pay now';
    case 'PROCESSING':
      return 'Processing';
    case 'CANCELLED':
      return 'Replaced';
    case 'REFUNDED':
      return 'Refunded';
    default:
      return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}

/** A payment's date, or for a first payment without one when it's taken ("When the vendor accepts"). */
export const whenText = (due: string | null, firstLabel: string) => (due ? planDate(due) : firstLabel);
