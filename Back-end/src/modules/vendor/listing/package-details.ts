/** "What's included" list and minimum notice on a package. */

export const MAX_INCLUDED_ITEMS = 20;
export const MAX_INCLUDED_ITEM_LENGTH = 120;
/** Dos and don'ts (instructions for using the equipment) on a package or rental item. */
export const MAX_DOS = 15;
export const MAX_DO_LENGTH = 200;
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

/**
 * Tags as forms send them: a list, a JSON list, or the comma-separated text the website's tag box holds
 * ("wedding, dj"). Trimmed, without empties or repeats; an empty field clears them.
 */
export function readTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  let list: unknown[];
  if (Array.isArray(value)) list = value.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v]));
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      list = Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      list = value.split(',');
    }
  } else list = [value];
  const tags = list.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '');
  return [...new Set(tags)] as string[];
}

/** An empty form field clears the notice (null); undefined means "not sent". */
export function readNoticeHours(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return Number(value);
}

/** A yes/no setting from a form (multipart sends text): empty clears it (null), anything else stays as sent for validation. */
export function readFlag(value: unknown): boolean | null | undefined | unknown {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
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

/** How long a vendor-set service can run: 15 minutes to a week. */
export const MIN_SERVICE_MINUTES = 15;
export const MAX_SERVICE_MINUTES = 7 * 24 * 60;

/** A package's service length setting (owner's ask, Nov 2026: "let the vendor toggle if the customer can set the service duration"). */
export interface ServiceLength {
  customer_sets_duration?: boolean | null;
  service_duration_minutes?: number | null;
  price_unit?: string | null;
}

/** True when the vendor sets how long the service runs (hourly packages are always the customer's choice: they pay by the hour). */
export const vendorSetsLength = (l: ServiceLength) => l.customer_sets_duration === false && l.price_unit !== 'hour' && !!l.service_duration_minutes;

/**
 * The end of a request on a package whose vendor sets the length: its start plus that length (whatever
 * end the customer's app sent). Undefined when the customer chooses, or there's no start yet.
 */
export function vendorSetEnd(l: ServiceLength, start?: Date | string | null): string | undefined {
  if (!vendorSetsLength(l) || !start) return undefined;
  return new Date(new Date(start).getTime() + l.service_duration_minutes! * 60_000).toISOString();
}

export class ServiceLengthError extends Error {}

/** The columns to save for the setting, checked together (the vendor needs a length when customers can't choose one). */
export function serviceLengthColumns(sent: ServiceLength, saved?: ServiceLength) {
  const customerSets = sent.customer_sets_duration ?? saved?.customer_sets_duration ?? true;
  const minutes = sent.service_duration_minutes !== undefined ? sent.service_duration_minutes : saved?.service_duration_minutes ?? null;
  if (!customerSets && !minutes) throw new ServiceLengthError('Set how long the service runs, or let customers choose.');
  return { customer_sets_duration: customerSets, service_duration_minutes: minutes || null };
}
