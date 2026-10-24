/**
 * A calendar date the API sends as "2026-12-20" or "2026-12-20T00:00:00.000Z" (date-only columns),
 * as that same day at local midnight. parseISO would read it as UTC midnight, which is the day
 * before anywhere west of UTC.
 */
export function dateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
