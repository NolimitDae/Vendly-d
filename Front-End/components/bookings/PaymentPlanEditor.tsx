"use client";

import dayjs from "dayjs";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addRow, evenRows, MAX_PLAN_PAYMENTS, MIN_PLAN_PAYMENT, money, planDate, remainder, type PlanDraftRow } from "@/lib/payment-plan";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

interface Props {
  rows: PlanDraftRow[];
  onChange: (rows: PlanDraftRow[]) => void;
  /** what the payments must add up to */
  total: number;
  /** the Vendly Protection fee charged with the first payment (0 when it was already paid) */
  feeOwed: number;
  /** what "no date" on the first payment means: "When you accept" / "Now" */
  firstLabel: string;
  /** the last day a payment can be due */
  latest?: string | null;
}

/**
 * The payment rows of a custom plan: an amount and a date each (the first may be taken straight away),
 * "Split evenly", "Add payment" and the running remainder. The server checks the plan again.
 */
export default function PaymentPlanEditor({ rows, onChange, total, feeOwed, firstLabel, latest }: Props) {
  const left = remainder(rows, total);
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
  const max = latest ? dayjs(latest).format("YYYY-MM-DD") : undefined;
  const set = (key: string, patch: Partial<PlanDraftRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {`Each payment is at least ${money(MIN_PLAN_PAYMENT)}, except the last. `}
        {feeOwed > 0 && `The first payment includes the Vendly Protection fee of ${money(feeOwed)} and is the deposit: it isn’t refunded if the customer cancels. `}
        {latest && `The last payment can be due up to ${planDate(latest)}.`}
      </p>
      <ol className="space-y-2" aria-label="Payments">
        {rows.map((r, k) => (
          <li key={r.key} className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
            <p className="w-full text-xs font-semibold text-gray-700 dark:text-gray-300">
              Payment {k + 1}
              {k === 0 && feeOwed > 0 ? " (deposit)" : ""}
            </p>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Amount
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => set(r.key, { amount: e.target.value })}
                aria-label={`Amount of payment ${k + 1}`}
                className={`${inputCls} mt-1 w-36`}
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              {k === 0 ? `Date (leave empty for ${firstLabel.toLowerCase()})` : "Date"}
              <input
                type="date"
                value={r.date}
                min={tomorrow}
                max={max}
                onChange={(e) => set(r.key, { date: e.target.value })}
                aria-label={`Date of payment ${k + 1}`}
                className={`${inputCls} mt-1 w-44`}
              />
            </label>
            {k === 0 && !r.date && <p className="text-xs text-gray-500 dark:text-gray-400 pb-2">{firstLabel}</p>}
            {rows.length > 2 && (
              <button type="button" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} aria-label={`Remove payment ${k + 1}`} className="ml-auto p-1.5 text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange(evenRows(rows, total, latest))} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
          Split evenly
        </button>
        <button
          type="button"
          disabled={rows.length >= MAX_PLAN_PAYMENTS}
          onClick={() => onChange(addRow(rows, total))}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" aria-hidden /> Add payment
        </button>
        <p role="status" aria-live="polite" className={cn("ml-auto text-sm", left === 0 ? "text-green-600" : "text-amber-700 dark:text-amber-300")}>
          {left === 0 ? `Adds up to ${money(total)}` : left > 0 ? `${money(left)} left to place of ${money(total)}` : `${money(-left)} over ${money(total)}`}
        </p>
      </div>
    </div>
  );
}
