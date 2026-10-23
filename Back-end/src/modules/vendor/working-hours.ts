/**
 * A vendor's weekly working hours (VendorProfile.working_hours).
 *
 * Shape: `{ mon: { open: '09:00', close: '17:00' } | null, tue: …, …, sun: … }`: null is a closed day.
 * No hours at all (null / absent column) means "not set": any day, any time, as before.
 * Times are wall-clock times where the event is (the customer's time zone on the request).
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { open: string; close: string } | null;
export type WorkingHours = Record<DayKey, DayHours>;

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
  const obj = value as Record<string, unknown>;
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

/** "The vendor works 9am–5pm on Saturdays." / "The vendor doesn't work on Sundays." */
export function hoursMessage(hours: WorkingHours, day: DayKey): string {
  const h = hours[day];
  return h
    ? `The vendor works ${formatTime(h.open)}–${formatTime(h.close)} on ${DAY_NAMES[day]}s.`
    : `The vendor doesn't work on ${DAY_NAMES[day]}s. Please pick another day.`;
}

/**
 * Why a booking at these times falls outside the vendor's hours, or null when it fits (or no hours
 * are set). The start day must be open, and start and end must both fall within that day's hours
 * in the customer's time zone. With no end time only the start is checked.
 */
export function outsideWorkingHours(hours: WorkingHours | null, start: Date, end: Date | null | undefined, timeZone?: string | null): string | null {
  if (!hours) return null;
  const s = localWeekdayAndMinutes(start, timeZone);
  const day = hours[s.day];
  if (!day) return hoursMessage(hours, s.day);
  const open = minutesOf(day.open);
  const close = minutesOf(day.close);
  if (s.minutes < open || s.minutes >= close) return hoursMessage(hours, s.day);
  if (end && end > start) {
    const e = localWeekdayAndMinutes(end, timeZone);
    const nextDay = new Date(Date.parse(`${s.ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const sameDay = e.ymd === s.ymd && e.minutes <= close;
    // open until midnight: ending exactly at 00:00 the next day is fine
    const atMidnight = close === 24 * 60 && e.ymd === nextDay && e.minutes === 0;
    if (!sameDay && !atMidnight) return hoursMessage(hours, s.day);
  }
  return null;
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
