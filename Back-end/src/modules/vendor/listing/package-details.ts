/** "What's included" list and minimum notice on a package. */

export const MAX_INCLUDED_ITEMS = 20;
export const MAX_INCLUDED_ITEM_LENGTH = 120;
// 90 days
export const MAX_MIN_NOTICE_HOURS = 2160;

/**
 * Reads the included items from JSON (multipart forms send a JSON string), an array, or one line per item.
 * Items are trimmed and empty ones dropped; undefined means "not sent" (leave as is).
 */
export function readIncludedItems(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  let list: unknown[];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      list = Array.isArray(parsed) ? parsed : [value];
    } catch {
      list = value.split('\n');
    }
  } else list = [value];
  return list.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '') as string[];
}

/** An empty form field clears the notice (null); undefined means "not sent". */
export function readNoticeHours(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return Number(value);
}

/** "3 days" for whole days, else "36 hours". */
export function noticeLabel(hours: number) {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** A friendly message when the event starts sooner than the package's minimum notice, else null. */
export function tooSoonMessage(minNoticeHours: number | null | undefined, start: Date | string | null | undefined, now = new Date()) {
  if (!minNoticeHours || !start) return null;
  const earliest = now.getTime() + minNoticeHours * 3600 * 1000;
  if (new Date(start).getTime() >= earliest) return null;
  return `This package needs to be booked at least ${noticeLabel(minNoticeHours)} ahead. Please pick a later date.`;
}

/** A package can have up to this many photos. */
export const MAX_LISTING_PHOTOS = 10;

/**
 * Reads `keep_images` (the existing photos the vendor kept, a JSON array in multipart forms).
 * undefined means "not sent": older apps, where new photos replace all the old ones.
 */
export function readKeepImages(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    if (value.trim() === '') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return [value as string];
}

/**
 * The listing's stored photo names the vendor kept, in their order. The apps send back the photo URLs
 * (or names) they were given; anything that isn't one of this listing's photos is ignored.
 */
export function keptImageNames(current: string[], keep: string[]): string[] {
  const names = keep.map((k) => {
    const last = String(k).split(/[?#]/)[0].split('/').pop() ?? '';
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  });
  return [...new Set(names)].filter((n) => current.includes(n));
}
