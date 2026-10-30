"use client";

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
const QUICK_PERCENTS = [25, 50];

export const emptyDepositTerms = (): DepositTermsValue => ({ percent: "25", days: "7", afterService: true });

/** The saved numbers of a package (its edit form), else the defaults. */
export function depositTermsFrom(l: { deposit_percent?: number | null; balance_due_days?: number | null; balance_after_service?: boolean | null }): DepositTermsValue {
  const d = emptyDepositTerms();
  if (l.deposit_percent == null) return d;
  return { percent: String(l.deposit_percent), days: String(l.balance_due_days ?? d.days), afterService: !!l.balance_after_service };
}

/** Checks the numbers for a custom deposit; returns a message to show, or null. */
export function depositTermsError(plan: string, v: DepositTermsValue) {
  if (plan !== "DEPOSIT_CUSTOM") return null;
  const p = Number(v.percent);
  if (!v.percent || !Number.isInteger(p) || p < MIN_DEPOSIT_PERCENT || p > MAX_DEPOSIT_PERCENT) return `The deposit must be a whole percentage from ${MIN_DEPOSIT_PERCENT}% to ${MAX_DEPOSIT_PERCENT}%.`;
  if (v.afterService) return null;
  const d = Number(v.days);
  if (!v.days || !Number.isInteger(d) || d < 1 || d > MAX_BALANCE_DAYS) return `The balance must be due 1 to ${MAX_BALANCE_DAYS} days before the event.`;
  return null;
}

/** Adds the custom deposit's numbers to the listing form data (only for that plan). */
export function appendDepositTerms(fd: FormData, plan: string, v: DepositTermsValue) {
  if (plan !== "DEPOSIT_CUSTOM") return;
  fd.append("deposit_percent", v.percent);
  fd.append("balance_after_service", String(v.afterService));
  if (!v.afterService) fd.append("balance_due_days", v.days);
}

const inputCls =
  "w-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";
const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${on ? "bg-primary text-white border-primary" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary"}`;

/** The deposit percentage and the balance timing, shown when the package's plan is "Custom deposit". */
export default function DepositPlanFields({ plan, value, onChange }: { plan: string; value: DepositTermsValue; onChange: (v: DepositTermsValue) => void }) {
  if (plan !== "DEPOSIT_CUSTOM") return null;
  const set = (patch: Partial<DepositTermsValue>) => onChange({ ...value, ...patch });
  const pct = Number(value.percent);
  const days = Number(value.days);
  return (
    <div className="mt-3 space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div>
        <label htmlFor="deposit-percent" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Deposit when you accept
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_PERCENTS.map((q) => (
            <button key={q} type="button" className={chip(pct === q)} aria-pressed={pct === q} onClick={() => set({ percent: String(q) })}>
              {q}%
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              id="deposit-percent"
              type="number"
              min={MIN_DEPOSIT_PERCENT}
              max={MAX_DEPOSIT_PERCENT}
              step="1"
              value={value.percent}
              onChange={(e) => set({ percent: e.target.value })}
              className={inputCls}
              aria-describedby="deposit-percent-hint"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300">%</span>
          </div>
        </div>
        <p id="deposit-percent-hint" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Any whole number from {MIN_DEPOSIT_PERCENT}% to {MAX_DEPOSIT_PERCENT}%.
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Balance due</legend>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="balance-timing" className="mt-1" checked={value.afterService} onChange={() => set({ afterService: true })} />
            <span>
              After the service
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Charged when the customer confirms the work, or automatically if they don&apos;t report a problem within 48 hours of you marking the job complete. You&apos;ll add photos of the finished job before you mark it complete.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="balance-timing" checked={!value.afterService} onChange={() => set({ afterService: false })} />
            <input
              type="number"
              min="1"
              max={MAX_BALANCE_DAYS}
              step="1"
              value={value.days}
              disabled={value.afterService}
              onChange={(e) => set({ days: e.target.value })}
              className={`${inputCls} disabled:opacity-50`}
              aria-label="Days before the event"
            />
            <span>days before the event</span>
          </label>
        </div>
      </fieldset>

      {pct >= MIN_DEPOSIT_PERCENT && pct <= MAX_DEPOSIT_PERCENT && (
        <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
          Customers pay <span className="font-semibold text-primary">{pct}%</span> when you accept and the rest{" "}
          {value.afterService ? "after the service" : days >= 1 ? `${days} ${days === 1 ? "day" : "days"} before the event` : "before the event"}.
        </p>
      )}
    </div>
  );
}
