const DAY = 24 * 60 * 60 * 1000;

type DayRange = { start_date: Date; end_date: Date };

/** Joins overlapping or back-to-back day ranges (inclusive ends) so a busy week reads as one block. */
export function mergeDayRanges<T extends DayRange>(ranges: T[]): DayRange[] {
  const sorted = [...ranges].sort((a, b) => a.start_date.getTime() - b.start_date.getTime());
  const out: DayRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start_date.getTime() <= last.end_date.getTime() + DAY) {
      if (r.end_date > last.end_date) last.end_date = r.end_date;
    } else {
      out.push({ start_date: r.start_date, end_date: r.end_date });
    }
  }
  return out;
}

/** Today at 00:00 UTC, the form @db.Date columns come back in. */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The calendar day a moment falls on where the customer is (00:00 UTC of that date, like @db.Date).
 * An unknown time zone falls back to UTC.
 */
export function localDay(at: Date, timeZone?: string | null): Date {
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    ymd = at.toISOString().slice(0, 10);
  }
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Every local day an event touches, start to end (at most two weeks; longer is treated as two weeks). */
export function eventDays(start: Date, end: Date | null | undefined, timeZone?: string | null): { first: Date; last: Date } {
  const first = localDay(start, timeZone);
  const lastRaw = end && end > start ? localDay(new Date(end.getTime() - 1), timeZone) : first;
  const last = new Date(Math.min(lastRaw.getTime(), first.getTime() + 13 * DAY));
  return { first, last };
}
