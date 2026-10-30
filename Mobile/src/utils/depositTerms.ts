/**
 * A package's own deposit (payment plan DEPOSIT_CUSTOM): the share customers pay when the vendor accepts
 * (10 to 90%), and when the balance is charged, some days before the event or after the service, once the
 * customer confirms the work (Back-end payments/payment-schedule.ts).
 */
export interface DepositTermsValue {
  percent: string;
  days: string;
  afterService: boolean;
}

export const MIN_DEPOSIT_PERCENT = 10;
export const MAX_DEPOSIT_PERCENT = 90;
export const MAX_BALANCE_DAYS = 60;

export const emptyDepositTerms = (): DepositTermsValue => ({ percent: '25', days: '7', afterService: true });

/** The saved numbers of a package (editing it), else the defaults. */
export function depositTermsFrom(l: { deposit_percent?: number | null; balance_due_days?: number | null; balance_after_service?: boolean | null }): DepositTermsValue {
  const d = emptyDepositTerms();
  if (l.deposit_percent == null) return d;
  return { percent: String(l.deposit_percent), days: String(l.balance_due_days ?? d.days), afterService: !!l.balance_after_service };
}

/** Checks the numbers for a custom deposit; returns a message to show, or null. */
export function depositTermsError(plan: string, v: DepositTermsValue) {
  if (plan !== 'DEPOSIT_CUSTOM') return null;
  const p = Number(v.percent);
  if (!v.percent || !Number.isInteger(p) || p < MIN_DEPOSIT_PERCENT || p > MAX_DEPOSIT_PERCENT) return `The deposit must be a whole percentage from ${MIN_DEPOSIT_PERCENT}% to ${MAX_DEPOSIT_PERCENT}%.`;
  if (v.afterService) return null;
  const d = Number(v.days);
  if (!v.days || !Number.isInteger(d) || d < 1 || d > MAX_BALANCE_DAYS) return `The balance must be due 1 to ${MAX_BALANCE_DAYS} days before the event.`;
  return null;
}

/** Adds the custom deposit's numbers to the package form data (only for that plan). */
export function appendDepositTerms(fd: FormData, plan: string, v: DepositTermsValue) {
  if (plan !== 'DEPOSIT_CUSTOM') return;
  fd.append('deposit_percent', v.percent);
  fd.append('balance_after_service', String(v.afterService));
  if (!v.afterService) fd.append('balance_due_days', v.days);
}

/** "Customers pay 25% when you accept and the rest after the service." */
export function depositSummary(v: DepositTermsValue) {
  const p = Number(v.percent);
  if (!(p >= MIN_DEPOSIT_PERCENT && p <= MAX_DEPOSIT_PERCENT)) return null;
  const d = Number(v.days);
  const rest = v.afterService ? 'after the service' : d >= 1 ? `${d} ${d === 1 ? 'day' : 'days'} before the event` : 'before the event';
  return `Customers pay ${p}% when you accept and the rest ${rest}.`;
}
