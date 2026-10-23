/**
 * A vendor's weekly working hours, as the API sends them (VendorProfile.working_hours):
 * `{ mon: { open: "09:00", close: "17:00" } | null, …, sun }`. null for a day = closed;
 * no hours at all = not set (any day, any time). Mirrors Back-end/src/modules/vendor/working-hours.ts.
 */

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { open: string; close: string } | null;
/** `timezone`: the vendor's IANA zone the times are in (hours saved before it was kept have none). */
export type WorkingHours = Record<DayKey, DayHours> & { timezone?: string };

export const DAY_NAMES: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** JS getDay() (0 = Sunday) to our keys. */
const BY_JS_DAY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "09:00" -> "9am", "17:30" -> "5:30pm", "24:00" -> "midnight" */
export function formatTime(t: string): string {
  const h = Number(t.slice(0, 2));
  if (h === 24) return "midnight";
  const m = t.slice(3, 5);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
}

/** Every half hour of the day, for the vendor's open/close selects (close can be 24:00). */
export const TIME_STEPS: string[] = Array.from({ length: 48 }, (_, i) => hhmm(i * 30));
export const CLOSE_STEPS: string[] = [...TIME_STEPS.slice(1), "24:00"];

/** A day (YYYY-MM-DD, or a Date in local time) to its key. */
export function dayKeyOf(date: string | Date): DayKey {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  return BY_JS_DAY[d.getDay()];
}

/** This device's IANA time zone ("America/Chicago"); what a vendor's hours are saved in. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// calendars ask about every day on screen: remember the answer per hours and day
const openDays = new WeakMap<WorkingHours, Map<string, boolean>>();

/** "America/Chicago" -> "Chicago time", "UTC" -> "UTC" (same words as the API). */
export function zoneLabel(tz: string): string {
  const city = tz.split("/").pop()!.replace(/_/g, " ");
  return /^(UTC|GMT|Etc\/)/i.test(tz) ? city : `${city} time`;
}

/** The vendor's zone when their hours carry one that isn't this device's; null otherwise. */
export function otherZone(hours: WorkingHours | null | undefined, viewerZone = deviceTimeZone()): string | null {
  const tz = hours?.timezone;
  return tz && tz !== viewerZone ? tz : null;
}

/** "Mon–Fri 9am–5pm" -> "Mon–Fri 9am–5pm (Chicago time)" when the vendor's hours are in another zone. */
export function withZone(text: string, hours: WorkingHours | null | undefined): string {
  const tz = otherZone(hours);
  return tz ? `${text} (${zoneLabel(tz)})` : text;
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A wall-clock time on a day here, as a moment ("24:00" is the next midnight). */
function localMoment(date: string, t: string): Date {
  if (t === "24:00") {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d;
  }
  return new Date(`${date}T${t}:00`);
}

/** The weekday, minutes after midnight and day of a moment in a zone; null if this device can't tell. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(at: Date, timeZone: string): { day: DayKey; minutes: number; ymd: string } | null {
  try {
    let f = formatters.get(timeZone);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
      formatters.set(timeZone, f);
    }
    const parts = f.formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = get("weekday").toLowerCase().slice(0, 3) as DayKey;
    if (!DAY_KEYS.includes(day)) return null;
    return { day, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")), ymd: `${get("year")}-${get("month")}-${get("day")}` };
  } catch {
    return null;
  }
}

/** Whether a start (and end) fits the vendor's hours in their zone: the API's rule (outsideWorkingHours). */
function fitsIn(hours: WorkingHours, tz: string, start: Date, end: Date | null): boolean | null {
  const s = partsIn(start, tz);
  if (!s) return null;
  const day = hours[s.day];
  if (!day) return false;
  const open = minutesOf(day.open);
  const close = minutesOf(day.close);
  if (s.minutes < open || s.minutes >= close) return false;
  if (end && end > start) {
    const e = partsIn(end, tz);
    if (!e) return null;
    const nextDay = new Date(Date.parse(`${s.ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const sameDay = e.ymd === s.ymd && e.minutes <= close;
    const atMidnight = close === 24 * 60 && e.ymd === nextDay && e.minutes === 0;
    if (!sameDay && !atMidnight) return false;
  }
  return true;
}

/**
 * Times on a day here that fit the vendor's hours in their zone, or null when the hours are in this
 * device's zone (or it can't convert): then the hours are read as they are.
 */
function convertedTimes(hours: WorkingHours, date: string, from: number, to: number, step: number, test: (t: string) => Date[]): string[] | null {
  const tz = otherZone(hours);
  if (!tz) return null;
  const out: string[] = [];
  for (let m = from; m <= to; m += step) {
    const t = hhmm(m);
    const [start, end] = test(t);
    const ok = fitsIn(hours, tz, start, end ?? null);
    if (ok === null) return null;
    if (ok) out.push(t);
  }
  return out;
}

export function hoursOn(hours: WorkingHours | null | undefined, date: string | Date): DayHours | undefined {
  if (!hours) return undefined;
  return hours[dayKeyOf(date)];
}

/** False only when hours are set and nothing on that day fits them. */
export function isOpenDay(hours: WorkingHours | null | undefined, date: string | Date): boolean {
  if (!hours) return true;
  const tz = otherZone(hours);
  if (tz) {
    const day = typeof date === "string" ? date : ymdOf(date);
    let known = openDays.get(hours);
    if (!known) openDays.set(hours, (known = new Map()));
    const key = `${tz}|${day}`;
    if (!known.has(key)) {
      const times = startTimesOn(hours, day);
      if (times) known.set(key, times.length > 0);
    }
    const open = known.get(key);
    if (open !== undefined) return open;
  }
  return hours[dayKeyOf(date)] !== null;
}

/**
 * "The vendor works 9am–5pm on Saturdays." / "The vendor doesn't work on Sundays." (same words as the
 * API), with the vendor's zone when it isn't this device's: "The vendor works 9am–5pm (Chicago time) on Saturdays."
 */
export function hoursMessage(hours: WorkingHours, day: DayKey): string {
  const h = hours[day];
  const tz = otherZone(hours);
  const where = tz ? ` (${zoneLabel(tz)})` : "";
  return h ? `The vendor works ${formatTime(h.open)}–${formatTime(h.close)}${where} on ${DAY_NAMES[day]}s.` : `The vendor doesn't work on ${DAY_NAMES[day]}s${where}.`;
}

/**
 * Start times a customer can pick on that day: every `step` minutes from opening, ending at least
 * `minMinutes` before closing. Null when hours aren't set (any time). Hours in another zone are
 * turned into this device's times.
 */
export function startTimesOn(hours: WorkingHours | null | undefined, date: string, step = 30, minMinutes = step): string[] | null {
  if (!hours || !date) return null;
  const converted = convertedTimes(hours, date, 0, 24 * 60 - step, step, (t) => {
    const start = localMoment(date, t);
    return [start, new Date(start.getTime() + minMinutes * 60_000)];
  });
  if (converted) return converted;
  const day = hours[dayKeyOf(date)];
  if (!day) return [];
  const out: string[] = [];
  for (let m = minutesOf(day.open); m + minMinutes <= minutesOf(day.close); m += step) out.push(hhmm(m));
  return out;
}

/** End times after `start`, up to closing. Null when hours aren't set. */
export function endTimesOn(hours: WorkingHours | null | undefined, date: string, start: string, step = 30): string[] | null {
  if (!hours || !date) return null;
  if (start) {
    const converted = convertedTimes(hours, date, minutesOf(start) + step, 24 * 60, step, (t) => [localMoment(date, start), localMoment(date, t)]);
    if (converted) return converted;
  }
  const day = hours[dayKeyOf(date)];
  if (!day || !start) return [];
  const out: string[] = [];
  for (let m = minutesOf(start) + step; m <= minutesOf(day.close); m += step) out.push(hhmm(m));
  return out;
}

/** "Mon–Fri 9am–5pm · Sat 10am–2pm"; null when hours aren't set. */
export function summariseHours(hours: WorkingHours | null | undefined): string | null {
  if (!hours) return null;
  const groups: { from: DayKey; to: DayKey; label: string }[] = [];
  DAY_KEYS.forEach((day, i) => {
    const h = hours[day];
    const label = h ? `${formatTime(h.open)}–${formatTime(h.close)}` : "";
    const last = groups[groups.length - 1];
    if (last && last.label === label && DAY_KEYS.indexOf(last.to) === i - 1) last.to = day;
    else groups.push({ from: day, to: day, label });
  });
  const short = (d: DayKey) => DAY_NAMES[d].slice(0, 3);
  const open = groups.filter((g) => g.label);
  if (!open.length) return "Not taking bookings on any day";
  return open.map((g) => `${g.from === g.to ? short(g.from) : `${short(g.from)}–${short(g.to)}`} ${g.label}`).join(" · ");
}

/** The week as a vendor saves it: the 7 days, in this device's time zone (so customers elsewhere see the right times). */
export function withDeviceZone(hours: WorkingHours): WorkingHours {
  const out = {} as WorkingHours;
  for (const day of DAY_KEYS) out[day] = hours[day];
  const tz = deviceTimeZone();
  if (tz) out.timezone = tz;
  return out;
}

/** Problems with hours a vendor is about to save (same rules as the API), or null. */
export function hoursProblem(hours: WorkingHours): string | null {
  for (const day of DAY_KEYS) {
    const h = hours[day];
    if (h && minutesOf(h.open) >= minutesOf(h.close)) return `${DAY_NAMES[day]}: the closing time must be after the opening time.`;
  }
  return null;
}

/** A sensible starting week for a vendor setting hours for the first time: Mon–Fri 9–5, weekends closed. */
export const DEFAULT_WEEK: WorkingHours = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null,
};
