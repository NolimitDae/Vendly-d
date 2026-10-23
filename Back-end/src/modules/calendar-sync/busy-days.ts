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
