/**
 * A vendor's weekly working hours (VendorProfile.working_hours).
 *
 * Shape: `{ mon: { open: '09:00', close: '17:00' } | null, tue: …, …, sun: …, timezone?: 'America/Chicago' }`:
 * null is a closed day. No hours at all (null / absent column) means "not set": any day, any time.
 * Times are wall-clock times in the vendor's time zone (`timezone`, an IANA name the vendor's device
 * sends when the hours are saved). Hours saved before the zone was kept have none: they are read in
 * the customer's time zone from the request.
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { open: string; close: string } | null;
export type WorkingHours = Record<DayKey, DayHours> & { timezone?: string };

export const UNKNOWN_TIMEZONE = 'Your time zone wasn’t recognised. Please refresh and try again.';

/** An IANA zone name ("America/Chicago", "UTC") Intl knows, as Intl spells it; null otherwise (offsets like "+05:00" too). */
export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** "America/Chicago" -> "Chicago time", "UTC" -> "UTC". */
export function zoneLabel(tz: string): string {
  const city = tz.split('/').pop()!.replace(/_/g, ' ');
  return /^(UTC|GMT|Etc\/)/i.test(tz) ? city : `${city} time`;
}

const DAY_NAMES: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** A closing time can also be 24:00 (midnight at the end of the day). */
const CLOSE = /^(([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

/** "09:30" -> 570 */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "09:00" -> "9am", "17:30" -> "5:30pm", "00:00" -> "12am", "24:00" -> "midnight" */
export function formatTime(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (h === 24) return 'midnight';
  const m = hhmm.slice(3, 5);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m === '00' ? '' : `:${m}`}${suffix}`;
}

/**
 * Checks hours sent by a vendor. `null` (or an empty string) clears them; a JSON string is accepted
 * for multipart forms. Every one of the 7 days must be present: closed (null) or open < close (HH:MM).
 */
export function parseWorkingHours(input: unknown): { hours: WorkingHours | null } | { error: string } {
  if (input === null || input === '' || input === 'null') return { hours: null };
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { error: 'Working hours must be an object with a key for each day.' };
    }
    if (value === null) return { hours: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) return { error: 'Working hours must be an object with a key for each day.' };
  const { timezone, ...obj } = value as Record<string, unknown>;
  let zone: string | null = null;
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    zone = validTimeZone(timezone);
    if (!zone) return { error: 'Working hours: that time zone isn’t recognised. Use a name like America/Chicago.' };
  }
  const extra = Object.keys(obj).filter((k) => !(DAY_KEYS as readonly string[]).includes(k));
  if (extra.length) return { error: `Unknown day in working hours: ${extra[0]}. Use mon, tue, wed, thu, fri, sat and sun.` };
  const hours = {} as WorkingHours;
  for (const day of DAY_KEYS) {
    if (!(day in obj)) return { error: `Working hours need all 7 days (missing ${day}). Use null for a closed day.` };
    const d = obj[day];
    if (d === null) {
      hours[day] = null;
      continue;
    }
    if (typeof d !== 'object' || Array.isArray(d)) return { error: `${DAY_NAMES[day]}: give open and close times, or null when closed.` };
    const { open, close, ...rest } = d as Record<string, unknown>;
    if (Object.keys(rest).length) return { error: `${DAY_NAMES[day]}: only open and close are allowed.` };
    if (typeof open !== 'string' || !HHMM.test(open) || typeof close !== 'string' || !CLOSE.test(close)) {
      return { error: `${DAY_NAMES[day]}: times must be HH:MM (24-hour), like 09:00 and 17:00.` };
    }
    if (minutesOf(open) >= minutesOf(close)) return { error: `${DAY_NAMES[day]}: the closing time must be after the opening time.` };
    hours[day] = { open, close };
  }
  if (zone) hours.timezone = zone;
  return { hours };
}

/** What's stored, read leniently: anything malformed counts as "not set" so nobody is locked out. */
export function readWorkingHours(json: unknown): WorkingHours | null {
  if (json === null || json === undefined) return null;
  const parsed = parseWorkingHours(json);
  return 'hours' in parsed ? parsed.hours : null;
}

/** The weekday and minutes after midnight of a moment where the customer is (unknown zone = UTC). */
export function localWeekdayAndMinutes(at: Date, timeZone?: string | null): { day: DayKey; minutes: number; ymd: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = get('weekday').toLowerCase().slice(0, 3) as DayKey;
  const hour = Number(get('hour')) % 24;
  return { day, minutes: hour * 60 + Number(get('minute')), ymd: `${get('year')}-${get('month')}-${get('day')}` };
}

/**
 * "The vendor works 9am–5pm on Saturdays." / "The vendor doesn't work on Sundays." With `zone` (the
 * vendor's, when it isn't the customer's): "The vendor works 9am–5pm (Chicago time) on Saturdays."
 */
export function hoursMessage(hours: WorkingHours, day: DayKey, zone?: string | null): string {
  const h = hours[day];
  const where = zone ? ` (${zoneLabel(zone)})` : '';
  return h
    ? `The vendor works ${formatTime(h.open)}–${formatTime(h.close)}${where} on ${DAY_NAMES[day]}s.`
    : `The vendor doesn't work on ${DAY_NAMES[day]}s${where}. Please pick another day.`;
}

/**
 * Why a booking at these times falls outside the vendor's hours, or null when it fits (or no hours
 * are set). The start day must be open, and start and end must both fall within that day's hours
 * in `timeZone` (the vendor's; see hoursZone). With no end time only the start is checked.
 * `zoneNote` names the zone in the message (when it isn't the customer's).
 */
export function outsideWorkingHours(hours: WorkingHours | null, start: Date, end: Date | null | undefined, timeZone?: string | null, zoneNote?: string | null): string | null {
  if (!hours) return null;
  const s = localWeekdayAndMinutes(start, timeZone);
  const day = hours[s.day];
  if (!day) return hoursMessage(hours, s.day, zoneNote);
  const open = minutesOf(day.open);
  const close = minutesOf(day.close);
  if (s.minutes < open || s.minutes >= close) return hoursMessage(hours, s.day, zoneNote);
  if (end && end > start) {
    const e = localWeekdayAndMinutes(end, timeZone);
    const nextDay = new Date(Date.parse(`${s.ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const sameDay = e.ymd === s.ymd && e.minutes <= close;
    // open until midnight: ending exactly at 00:00 the next day is fine
    const atMidnight = close === 24 * 60 && e.ymd === nextDay && e.minutes === 0;
    if (!sameDay && !atMidnight) return hoursMessage(hours, s.day, zoneNote);
  }
  return null;
}

/**
 * The zone a booking is checked against the vendor's hours in: the vendor's own when their hours
 * carry one, else the customer's from the request when it's a real IANA zone. `error` when neither
 * (hours are never checked in a zone nobody chose). `differs`: the vendor's zone isn't the customer's.
 */
export function hoursZone(hours: WorkingHours, customerZone: unknown): { zone: string; differs: boolean } | { error: string } {
  const customer = validTimeZone(customerZone);
  const vendor = validTimeZone(hours.timezone);
  if (vendor) return { zone: vendor, differs: vendor !== customer };
  if (customer) return { zone: customer, differs: false };
  return { error: UNKNOWN_TIMEZONE };
}

/** "Mon–Fri 9am–5pm · Sat 10am–2pm", for listing pages; null when no hours are set. */
export function summariseWorkingHours(hours: WorkingHours | null): string | null {
  if (!hours) return null;
  const groups: { from: DayKey; to: DayKey; label: string }[] = [];
  for (const day of DAY_KEYS) {
    const h = hours[day];
    const label = h ? `${formatTime(h.open)}–${formatTime(h.close)}` : '';
    const last = groups[groups.length - 1];
    if (last && last.label === label && DAY_KEYS.indexOf(last.to) === DAY_KEYS.indexOf(day) - 1) last.to = day;
    else groups.push({ from: day, to: day, label });
  }
  const short = (d: DayKey) => DAY_NAMES[d].slice(0, 3);
  const open = groups.filter((g) => g.label);
  if (!open.length) return 'Not taking bookings on any day';
  return open.map((g) => `${g.from === g.to ? short(g.from) : `${short(g.from)}–${short(g.to)}`} ${g.label}`).join(' · ');
}
