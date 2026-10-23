/**
 * Reads busy time out of an iCalendar (RFC 5545) feed: Google "Secret address in iCal format", Apple public
 * calendars, Outlook published calendars.
 *
 * Handles all-day DATE values, UTC (Z) / TZID / floating date-times, DTEND or DURATION, and recurring events
 * (RRULE FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH) plus EXDATE,
 * RDATE and RECURRENCE-ID overrides. Free (TRANSP:TRANSPARENT) and cancelled events are left out.
 * Anything it can't make sense of is skipped rather than failing the whole calendar.
 */

export type BusyRange = {
  start: Date;
  end: Date;
  /** Days the event touches in its own time zone, YYYY-MM-DD, inclusive. */
  startDate: string;
  endDate: string;
  allDay: boolean;
};

export type ParseOptions = {
  from: Date;
  to: Date;
  /** Events whose UID ends with this are skipped (Vendly's own feed imported back). */
  skipUidSuffix?: string;
  /** Upper bound on ranges returned. */
  maxRanges?: number;
};

type Prop = { name: string; params: Record<string, string>; value: string };
type Local = { y: number; m: number; d: number; h: number; mi: number; s: number };
type DateValue = { kind: 'date'; naive: number } | { kind: 'utc'; at: number } | { kind: 'local'; naive: number; tz: string | null };

const DAY = 24 * 60 * 60 * 1000;
const MAX_PER_EVENT = 2000;
const MAX_PERIODS = 100_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Outlook / Exchange publish Windows zone names; the common ones mapped to IANA
const WINDOWS_ZONES: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'UTC': 'UTC',
  'Coordinated Universal Time': 'UTC',
};

// ─── Time zones ──────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatter(tz: string): Intl.DateTimeFormat | null {
  if (!formatters.has(tz)) {
    try {
      formatters.set(
        tz,
        new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
      );
    } catch {
      formatters.set(tz, null);
    }
  }
  return formatters.get(tz)!;
}

/** An IANA zone for a TZID value, or null when it can't be resolved. */
export function resolveZone(tzid: string | undefined | null): string | null {
  if (!tzid) return null;
  const name = tzid.trim().replace(/^"|"$/g, '');
  if (WINDOWS_ZONES[name]) return WINDOWS_ZONES[name];
  if (formatter(name)) return name;
  // e.g. "/mozilla.org/20050126_1/America/New_York"
  const segs = name.split('/').filter(Boolean);
  for (const n of [3, 2]) {
    const tail = segs.slice(-n).join('/');
    if (segs.length >= n && formatter(tail)) return tail;
  }
  return null;
}

/** Wall-clock time in `tz` at instant `ms`, as a "naive" UTC timestamp. */
function naiveIn(ms: number, tz: string): number {
  if (tz === 'UTC') return ms;
  const f = formatter(tz);
  if (!f) return ms;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The instant at which the wall clock in `tz` reads `naive`. */
export function zonedToUtc(naive: number, tz: string): number {
  if (tz === 'UTC') return naive;
  const whole = Math.floor(naive / 1000) * 1000;
  const offset = naiveIn(whole, tz) - whole;
  let t = naive - offset;
  // across a DST change the offset at the answer differs from the guess
  const offset2 = naiveIn(Math.floor(t / 1000) * 1000, tz) - Math.floor(t / 1000) * 1000;
  if (offset2 !== offset) t = naive - offset2;
  return t;
}

const isoDay = (naive: number) => new Date(naive).toISOString().slice(0, 10);
const floorDay = (naive: number) => Math.floor(naive / DAY) * DAY;

// ─── Content lines ───────────────────────────────────────────────────────────

/** Splits on `sep` outside double quotes. */
function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseLine(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.trim().toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

/** Unfolds and splits into content lines (RFC 5545 §3.1). */
export function contentLines(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n|\r/)
    .filter((l) => l.length > 0);
}

// ─── Values ──────────────────────────────────────────────────────────────────

function parseDateValue(value: string, params: Record<string, string>, defaultTz: string | null): DateValue | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { kind: 'date', naive: Date.UTC(+m[1], +m[2] - 1, +m[3]) };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i.exec(v);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) return { kind: 'utc', at: naive };
  // TZID wins; floating times use the calendar's own zone
  return { kind: 'local', naive, tz: resolveZone(params.TZID) ?? defaultTz };
}

/** P1D, PT1H30M, P1W, -PT15M … in milliseconds. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim());
  if (!m) return null;
  const ms = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY + (+(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

type Rule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: DateValue;
  byDay: { ord: number; wd: number }[];
  byMonthDay: number[];
  byMonth: number[];
  wkst: number;
};

function parseRule(value: string, defaultTz: string | null): Rule | null {
  const parts: Record<string, string> = {};
  for (const p of value.split(';')) {
    const [k, v] = p.split('=');
    if (k && v) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const freq = parts.FREQ as Rule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const ints = (s?: string) => (s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n !== 0) : []);
  const byDay = (parts.BYDAY ? parts.BYDAY.split(',') : [])
    .map((d) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ ord: m[1] ? Number(m[1]) : 0, wd: WEEKDAYS.indexOf(m[2]) }));
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: parts.COUNT ? Math.max(0, Number(parts.COUNT) || 0) : undefined,
    until: parts.UNTIL ? parseDateValue(parts.UNTIL, {}, defaultTz) ?? undefined : undefined,
    byDay,
    byMonthDay: ints(parts.BYMONTHDAY),
    byMonth: ints(parts.BYMONTH).filter((n) => n >= 1 && n <= 12),
    wkst: parts.WKST && WEEKDAYS.includes(parts.WKST) ? WEEKDAYS.indexOf(parts.WKST) : 1,
  };
}

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Days of one month (1-based) a MONTHLY/YEARLY rule lands on. */
function monthDays(y: number, m0: number, rule: Rule, defaultDay: number): number[] {
  const dim = daysInMonth(y, m0);
  const weekday = (d: number) => new Date(Date.UTC(y, m0, d)).getUTCDay();
  let days: number[];
  if (rule.byMonthDay.length) {
    days = rule.byMonthDay.map((n) => (n > 0 ? n : dim + n + 1)).filter((d) => d >= 1 && d <= dim);
    if (rule.byDay.length) days = days.filter((d) => rule.byDay.some((b) => b.wd === weekday(d)));
  } else if (rule.byDay.length) {
    days = [];
    for (const { ord, wd } of rule.byDay) {
      const all: number[] = [];
      for (let d = 1; d <= dim; d++) if (weekday(d) === wd) all.push(d);
      if (ord === 0) days.push(...all);
      else {
        const pick = ord > 0 ? all[ord - 1] : all[all.length + ord];
        if (pick) days.push(pick);
      }
    }
  } else {
    days = defaultDay <= dim ? [defaultDay] : [];
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

/**
 * Naive start times of a recurring event, in order, from `windowStart` up to `limit` (both naive) or the rule's end.
 * Occurrences before the window still count towards COUNT.
 * `untilOk` decides whether a naive start is still within UNTIL (zone-aware, so the caller supplies it).
 */
function expandRule(startNaive: number, rule: Rule, windowStart: number, limit: number, untilOk: (naive: number) => boolean): number[] {
  const out: number[] = [];
  const start = new Date(startNaive);
  const tod = startNaive - floorDay(startNaive);
  let count = 0;
  // returns false once the expansion is over
  const emit = (cand: number): boolean => {
    if (cand < startNaive) return true;
    if (!untilOk(cand) || cand > limit) return false;
    if (rule.byMonth.length && !rule.byMonth.includes(new Date(cand).getUTCMonth() + 1)) return true;
    count++;
    if (cand >= windowStart) out.push(cand);
    if (rule.count !== undefined && count >= rule.count) return false;
    return out.length < MAX_PER_EVENT;
  };

  if (rule.freq === 'DAILY') {
    const wds = rule.byDay.map((b) => b.wd);
    for (let p = 0, day = floorDay(startNaive); p < MAX_PERIODS; p++, day += rule.interval * DAY) {
      const d = new Date(day);
      if (wds.length && !wds.includes(d.getUTCDay())) {
        if (day + tod > limit) break;
        continue;
      }
      if (rule.byMonthDay.length && !monthDays(d.getUTCFullYear(), d.getUTCMonth(), rule, 0).includes(d.getUTCDate())) {
        if (day + tod > limit) break;
        continue;
      }
      if (!emit(day + tod)) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    const offsetOf = (wd: number) => (wd - rule.wkst + 7) % 7;
    const wds = [...new Set(rule.byDay.length ? rule.byDay.map((b) => b.wd) : [start.getUTCDay()])].sort((a, b) => offsetOf(a) - offsetOf(b));
    const weekStart = floorDay(startNaive) - offsetOf(start.getUTCDay()) * DAY;
    outer: for (let p = 0, ws = weekStart; p < MAX_PERIODS; p++, ws += 7 * rule.interval * DAY) {
      for (const wd of wds) if (!emit(ws + offsetOf(wd) * DAY + tod)) break outer;
    }
  } else {
    const y0 = start.getUTCFullYear();
    const m0 = start.getUTCMonth();
    const d0 = start.getUTCDate();
    outer: for (let p = 0; p < MAX_PERIODS; p++) {
      const months: [number, number][] =
        rule.freq === 'MONTHLY'
          ? [[y0 + Math.floor((m0 + p * rule.interval) / 12), (m0 + p * rule.interval) % 12]]
          : (rule.byMonth.length ? rule.byMonth.map((m) => m - 1) : [m0]).sort((a, b) => a - b).map((m) => [y0 + p * rule.interval, m] as [number, number]);
      for (const [y, m] of months) {
        // a YEARLY rule without BYDAY/BYMONTHDAY repeats on DTSTART's day
        const days = monthDays(y, m, rule, d0);
        if (!days.length && Date.UTC(y, m, 1) > limit) break outer;
        for (const d of days) if (!emit(Date.UTC(y, m, d) + tod)) break outer;
      }
    }
  }
  return out;
}

// ─── Events ──────────────────────────────────────────────────────────────────

type RawEvent = Map<string, Prop[]>;

function first(e: RawEvent, name: string): Prop | undefined {
  return e.get(name)?.[0];
}

/** Pulls VEVENTs (ignoring nested VALARMs) and the calendar's default zone out of the lines. */
function readCalendar(text: string): { events: RawEvent[]; defaultTz: string | null } {
  const events: RawEvent[] = [];
  const stack: string[] = [];
  let current: RawEvent | null = null;
  let defaultTz: string | null = null;
  for (const line of contentLines(text)) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      const comp = prop.value.toUpperCase();
      stack.push(comp);
      if (comp === 'VEVENT' && stack.length === 2) current = new Map();
      continue;
    }
    if (prop.name === 'END') {
      const comp = stack.pop();
      if (comp === 'VEVENT' && current && stack.length === 1) {
        events.push(current);
        current = null;
      }
      continue;
    }
    if (stack.length === 1 && stack[0] === 'VCALENDAR' && prop.name === 'X-WR-TIMEZONE') defaultTz = resolveZone(prop.value);
    // only the event's own properties, not those of an alarm inside it
    if (current && stack.length === 2) {
      const list = current.get(prop.name) ?? [];
      list.push(prop);
      current.set(prop.name, list);
    }
  }
  return { events, defaultTz };
}

/** Instant (timed) or naive day (all-day) used to match EXDATE / RECURRENCE-ID against occurrences. */
function occurrenceKey(v: DateValue, zone: string): number {
  if (v.kind === 'date') return v.naive;
  if (v.kind === 'utc') return v.at;
  return zonedToUtc(v.naive, v.tz ?? zone);
}

/** Busy ranges between `from` and `to`, ordered by start. */
export function parseIcs(text: string, opts: ParseOptions): BusyRange[] {
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) throw new Error('That address did not return an iCalendar (.ics) file.');
  const { events, defaultTz } = readCalendar(text);
  const calZone = defaultTz ?? 'UTC';
  const from = opts.from.getTime();
  const to = opts.to.getTime();
  const maxRanges = opts.maxRanges ?? 5000;

  // occurrences replaced by a RECURRENCE-ID override, per UID
  const overridden = new Map<string, Set<number>>();
  for (const e of events) {
    const rid = first(e, 'RECURRENCE-ID');
    const uid = first(e, 'UID')?.value ?? '';
    if (!rid || !uid) continue;
    const v = parseDateValue(rid.value, rid.params, defaultTz);
    if (!v) continue;
    const set = overridden.get(uid) ?? new Set<number>();
    set.add(occurrenceKey(v, calZone));
    overridden.set(uid, set);
  }

  const ranges: BusyRange[] = [];
  for (const e of events) {
    if (ranges.length >= maxRanges) break;
    const uid = first(e, 'UID')?.value ?? '';
    if (opts.skipUidSuffix && uid.toLowerCase().endsWith(opts.skipUidSuffix.toLowerCase())) continue;
    if ((first(e, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue;
    if ((first(e, 'TRANSP')?.value ?? '').toUpperCase() === 'TRANSPARENT') continue;
    if ((first(e, 'X-MICROSOFT-CDO-BUSYSTATUS')?.value ?? '').toUpperCase() === 'FREE') continue;

    const dtstart = first(e, 'DTSTART');
    const start = dtstart && parseDateValue(dtstart.value, dtstart.params, defaultTz);
    if (!start) continue;
    const allDay = start.kind === 'date';
    // recurrence is expanded on this zone's wall clock; UTC start times recur in UTC
    const zone = start.kind === 'local' ? start.tz ?? 'UTC' : 'UTC';
    const startNaive = start.kind === 'utc' ? start.at : start.naive;
    // the days a timed event blocks are counted in its own zone (or the calendar's, for UTC times)
    const dayZone = start.kind === 'local' && start.tz ? start.tz : calZone;
    const toUtc = (naive: number) => (allDay ? naive : zonedToUtc(naive, zone));

    // length: DTEND, else DURATION, else one day (all-day) / an instant (timed)
    let length = allDay ? DAY : 0;
    const dtend = first(e, 'DTEND');
    const endValue = dtend && parseDateValue(dtend.value, dtend.params, defaultTz);
    const duration = first(e, 'DURATION');
    if (endValue) {
      length = allDay
        ? (endValue.kind === 'date' ? endValue.naive : floorDay(endValue.kind === 'utc' ? endValue.at : endValue.naive)) - startNaive
        : occurrenceKey(endValue, zone) - toUtc(startNaive);
    } else if (duration) {
      length = parseDuration(duration.value) ?? length;
    }
    if (allDay) length = Math.max(DAY, Math.round(length / DAY) * DAY);
    else length = Math.max(0, length);

    // naive starts of every occurrence
    let starts: number[] = [startNaive];
    const rrule = first(e, 'RRULE');
    const rule = rrule && !first(e, 'RECURRENCE-ID') ? parseRule(rrule.value, defaultTz) : null;
    if (rule) {
      const until = rule.until;
      const untilOk = (naive: number) => {
        if (!until) return true;
        if (until.kind === 'date') return floorDay(naive) <= until.naive;
        if (allDay) return naive <= (until.kind === 'utc' ? until.at : until.naive);
        return toUtc(naive) <= occurrenceKey(until, zone);
      };
      // a day of slack either side so time zones never cut off an occurrence inside the window
      starts = expandRule(startNaive, rule, naiveIn(from, zone) - 2 * DAY - length, naiveIn(to, zone) + DAY, untilOk);
    }
    for (const rd of e.get('RDATE') ?? []) {
      for (const value of rd.value.split(',')) {
        const v = parseDateValue(value, rd.params, defaultTz);
        if (!v) continue;
        starts.push(v.kind === 'utc' ? (allDay ? floorDay(v.at) : naiveIn(v.at, zone)) : v.naive);
      }
    }

    const excluded = new Set<number>(overridden.get(uid) && !first(e, 'RECURRENCE-ID') ? overridden.get(uid) : []);
    for (const ex of e.get('EXDATE') ?? []) {
      for (const value of ex.value.split(',')) {
        const v = parseDateValue(value, ex.params, defaultTz);
        if (v) excluded.add(allDay ? (v.kind === 'utc' ? floorDay(v.at) : floorDay(v.naive)) : occurrenceKey(v, zone));
      }
    }

    const seen = new Set<number>();
    for (const naive of starts) {
      if (ranges.length >= maxRanges) break;
      const s = toUtc(naive);
      if (seen.has(s) || excluded.has(s)) continue;
      seen.add(s);
      const end = s + length;
      // inside the window (an instant counts when it falls in it)
      if (allDay ? !(end > from - DAY && s < to) : !(length > 0 ? end > from && s < to : s >= from && s < to)) continue;
      ranges.push(
        allDay
          ? { start: new Date(s), end: new Date(end), startDate: isoDay(s), endDate: isoDay(end - DAY), allDay: true }
          : {
              start: new Date(s),
              end: new Date(end),
              startDate: isoDay(naiveIn(s, dayZone)),
              endDate: isoDay(naiveIn(Math.max(s, end - 1), dayZone)),
              allDay: false,
            },
      );
    }
  }
  return ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
}
