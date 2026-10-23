/**
 * A vendor's weekly working hours, as the API sends them (VendorProfile.working_hours):
 * `{ mon: { open: "09:00", close: "17:00" } | null, …, sun }`. null for a day = closed;
 * no hours at all = not set (any day, any time). Mirrors Back-end/src/modules/vendor/working-hours.ts.
 */

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { open: string; close: string } | null;
export type WorkingHours = Record<DayKey, DayHours>;

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

export function hoursOn(hours: WorkingHours | null | undefined, date: string | Date): DayHours | undefined {
  if (!hours) return undefined;
  return hours[dayKeyOf(date)];
}

/** False only when hours are set and that day is closed. */
export function isOpenDay(hours: WorkingHours | null | undefined, date: string | Date): boolean {
  return !hours || hours[dayKeyOf(date)] !== null;
}

/** "The vendor works 9am–5pm on Saturdays." / "The vendor doesn't work on Sundays." (same words as the API) */
export function hoursMessage(hours: WorkingHours, day: DayKey): string {
  const h = hours[day];
  return h ? `The vendor works ${formatTime(h.open)}–${formatTime(h.close)} on ${DAY_NAMES[day]}s.` : `The vendor doesn't work on ${DAY_NAMES[day]}s.`;
}

/**
 * Start times a customer can pick on that day: every `step` minutes from opening, ending at least
 * `minMinutes` before closing. Null when hours aren't set (any time).
 */
export function startTimesOn(hours: WorkingHours | null | undefined, date: string, step = 30, minMinutes = step): string[] | null {
  if (!hours || !date) return null;
  const day = hours[dayKeyOf(date)];
  if (!day) return [];
  const out: string[] = [];
  for (let m = minutesOf(day.open); m + minMinutes <= minutesOf(day.close); m += step) out.push(hhmm(m));
  return out;
}

/** End times after `start`, up to closing. Null when hours aren't set. */
export function endTimesOn(hours: WorkingHours | null | undefined, date: string, start: string, step = 30): string[] | null {
  if (!hours || !date) return null;
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
