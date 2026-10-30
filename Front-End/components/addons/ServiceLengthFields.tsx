"use client";

/**
 * Who sets how long a package's service runs (Back-end listing/package-details.ts): the customer (the
 * default), or the vendor, who gives a length; customers then pick only a start time. Hourly packages are
 * always the customer's choice: they pay by the hour.
 */
export interface ServiceLengthValue {
  customerSets: boolean;
  hours: string;
}

export const MIN_SERVICE_MINUTES = 15;
export const MAX_SERVICE_MINUTES = 7 * 24 * 60;

export const emptyServiceLength = (): ServiceLengthValue => ({ customerSets: true, hours: "" });

/** The saved setting of a package (its edit form). */
export const serviceLengthFrom = (l: { customer_sets_duration?: boolean | null; service_duration_minutes?: number | null }): ServiceLengthValue => ({
  customerSets: l.customer_sets_duration !== false,
  hours: l.service_duration_minutes ? String(Math.round((l.service_duration_minutes / 60) * 100) / 100) : "",
});

/** Minutes from the hours a vendor types ("2.5"), or NaN. */
export const lengthMinutes = (hours: string) => (hours.trim() ? Math.round(Number(hours) * 60) : NaN);

/** "3 hours", "1.5 hours", "45 minutes", "2 days". */
export function lengthText(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes % (24 * 60) === 0) return minutes === 24 * 60 ? "1 day" : `${minutes / (24 * 60)} days`;
  const h = Math.round((minutes / 60) * 100) / 100;
  return h === 1 ? "1 hour" : `${h} hours`;
}

/** Checks a vendor-set length; returns a message to show, or null. */
export function serviceLengthError(unit: string, v: ServiceLengthValue) {
  if (v.customerSets || unit === "hour") return null;
  const m = lengthMinutes(v.hours);
  if (!Number.isFinite(m) || m < MIN_SERVICE_MINUTES) return "Enter how long the service runs, at least 15 minutes (0.25 hours).";
  if (m > MAX_SERVICE_MINUTES) return "The service can run at most 7 days (168 hours).";
  return null;
}

/** Adds the setting to the listing form data (hourly packages: customers always choose). */
export function appendServiceLength(fd: FormData, unit: string, v: ServiceLengthValue) {
  if (unit === "hour") return;
  fd.append("customer_sets_duration", String(v.customerSets));
  if (!v.customerSets) fd.append("service_duration_minutes", String(lengthMinutes(v.hours)));
}

const inputCls =
  "w-32 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";

/** "Customers choose how long" and, when off, the vendor's length. Hidden for hourly packages. */
export default function ServiceLengthFields({ unit, value, onChange }: { unit: string; value: ServiceLengthValue; onChange: (v: ServiceLengthValue) => void }) {
  if (unit === "hour") return null;
  const m = lengthMinutes(value.hours);
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 accent-primary"
          checked={value.customerSets}
          onChange={(e) => onChange({ ...value, customerSets: e.target.checked })}
        />
        <span>
          <span className="font-medium">Customers choose how long</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {value.customerSets ? "Customers pick a start and end time." : "You set how long it runs. Customers pick only a start time."}
          </span>
        </span>
      </label>
      {!value.customerSets && (
        <div>
          <label htmlFor="service-length" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Service length (hours)
          </label>
          <input
            id="service-length"
            type="number"
            min="0.25"
            max="168"
            step="0.25"
            placeholder="e.g. 3 or 1.5"
            value={value.hours}
            onChange={(e) => onChange({ ...value, hours: e.target.value })}
            className={inputCls}
          />
          {Number.isFinite(m) && m >= MIN_SERVICE_MINUTES && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" aria-live="polite">
              Every booking runs {lengthText(m)} from the start time the customer picks.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
