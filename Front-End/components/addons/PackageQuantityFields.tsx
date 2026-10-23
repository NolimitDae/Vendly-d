"use client";

import { packagePriceHint, perUnit } from "@/lib/addons";

export interface QuantityLimits {
  min: string;
  max: string;
}

const NOUNS = { person: "guests", hour: "hours", day: "days" } as const;

/** Checks the limits; returns a message to show, or null. */
export function limitsError(unit: string, l: QuantityLimits) {
  if (!perUnit(unit)) return null;
  const lo = l.min ? Number(l.min) : 0;
  const hi = l.max ? Number(l.max) : 0;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < 0) return "Minimum and maximum must be whole numbers.";
  if (lo && hi && lo > hi) return "The minimum can't be more than the maximum.";
  return null;
}

/**
 * Adds min_quantity / max_quantity to the listing form data for per person / hour / day packages.
 * `clear` (edit form) sends 0 for an empty field so the server removes an old limit.
 */
export function appendLimits(fd: FormData, unit: string, l: QuantityLimits, clear: boolean) {
  if (!perUnit(unit)) return;
  if (l.min || clear) fd.append("min_quantity", l.min || "0");
  if (l.max || clear) fd.append("max_quantity", l.max || "0");
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

/** "$45 per person" under the price, plus minimum / maximum guests, hours or days for counted packages. */
export default function PackageQuantityFields({
  unit,
  price,
  limits,
  onChange,
}: {
  unit: string;
  price: string;
  limits: QuantityLimits;
  onChange: (l: QuantityLimits) => void;
}) {
  const u = perUnit(unit);
  const hint = packagePriceHint(price, unit);
  return (
    <>
      {hint && (
        <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
          Customers see <span className="font-semibold text-primary">{hint}</span>
          {u === "person" ? ". They enter a guest count when booking." : u === "hour" ? ". They pick start and end times when booking." : u === "day" ? ". Priced by the days the event runs." : "."}
        </p>
      )}
      {u && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="min-quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Minimum {NOUNS[u]} (optional)
            </label>
            <input
              id="min-quantity"
              type="number"
              min="0"
              step="1"
              value={limits.min}
              onChange={(e) => onChange({ ...limits, min: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="max-quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Maximum {NOUNS[u]} (optional)
            </label>
            <input
              id="max-quantity"
              type="number"
              min="0"
              step="1"
              value={limits.max}
              onChange={(e) => onChange({ ...limits, max: e.target.value })}
              className={inputCls}
            />
          </div>
          <p className="col-span-2 text-xs text-gray-500 dark:text-gray-400">
            {u === "person"
              ? "Customers can't book for fewer or more guests than this."
              : `Shorter bookings are charged the minimum ${NOUNS[u]}. Leave blank for no limit.`}
          </p>
        </div>
      )}
    </>
  );
}
