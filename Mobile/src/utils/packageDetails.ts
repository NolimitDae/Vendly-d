/** "What's included" and minimum notice on a package (limits match the server). */

export const MAX_INCLUDED_ITEMS = 20;
export const MAX_INCLUDED_ITEM_LENGTH = 120;
export const MAX_MIN_NOTICE_HOURS = 2160;

/** "3 days" for whole days, else "36 hours". */
export function noticeLabel(hours: number) {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** The line shown on a package, or null when there's no minimum. */
export function noticeLine(hours?: number | null) {
  return hours ? `Book at least ${noticeLabel(hours)} ahead` : null;
}

/** The earliest moment an event can start for this package. */
export function earliestStart(hours?: number | null, now = new Date()) {
  return new Date(now.getTime() + (hours ?? 0) * 3600 * 1000);
}

/**
 * The first whole local day that can be booked: days before it are greyed out. A day
 * whose midnight is before the earliest start is skipped, since a booking without a start time counts
 * from midnight and would be refused.
 */
export function firstBookableDay(hours?: number | null, now = new Date()) {
  const earliest = earliestStart(hours, now);
  const day = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
  if (hours && day.getTime() < earliest.getTime()) day.setDate(day.getDate() + 1);
  return day;
}

/** A message when the start is sooner than the notice allows, else null (the server checks too). */
export function tooSoonMessage(hours: number | null | undefined, start: Date | null | undefined, now = new Date()) {
  if (!hours || !start) return null;
  if (start.getTime() >= earliestStart(hours, now).getTime()) return null;
  return `This package needs to be booked at least ${noticeLabel(hours)} ahead. Please pick a later date.`;
}

/** Notice in hours from the form (a number of days or hours); NaN when it isn't a whole number. */
export function noticeHours(value: string, unit: 'days' | 'hours') {
  if (!value.trim()) return 0;
  const n = Number(value);
  const h = n * (unit === 'days' ? 24 : 1);
  return Number.isInteger(h) && h >= 0 ? h : NaN;
}
