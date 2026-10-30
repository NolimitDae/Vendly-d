/**
 * Who sets how long a package's service runs (Back-end listing/package-details.ts): the customer (the
 * default), or the vendor, who gives a length; customers then pick only a start time. Hourly packages
 * are always the customer's choice: they pay by the hour.
 */
export const MIN_SERVICE_MINUTES = 15;
export const MAX_SERVICE_MINUTES = 7 * 24 * 60;

/** Minutes from the hours a vendor types ("2.5"), or NaN. */
export const lengthMinutes = (hours: string) => (hours.trim() ? Math.round(Number(hours) * 60) : NaN);

/** Checks a vendor-set length; returns a message to show, or null. */
export function serviceLengthError(priceUnit: string, customerSets: boolean, hours: string) {
  if (customerSets || priceUnit === 'hour') return null;
  const m = lengthMinutes(hours);
  if (!Number.isFinite(m) || m < MIN_SERVICE_MINUTES) return 'Enter how long the service runs, at least 15 minutes (0.25 hours).';
  if (m > MAX_SERVICE_MINUTES) return 'The service can run at most 7 days (168 hours).';
  return null;
}

/** "3 hours", "1.5 hours", "45 minutes", "2 days". */
export function lengthText(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes % (24 * 60) === 0) return minutes === 24 * 60 ? '1 day' : `${minutes / (24 * 60)} days`;
  const h = Math.round((minutes / 60) * 100) / 100;
  return h === 1 ? '1 hour' : `${h} hours`;
}
