import { bookingEarnings, type EarningsBooking } from 'src/modules/payments/vendor-earnings';

const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MAX_MONTHS = 24;

export interface DashboardBooking extends EarningsBooking {
  customer_id: string;
  customer: { id: string; name: string | null; avatar: string | null } | null;
  cancelled_at: Date | null;
  created_at: Date;
}

/** A real IANA zone, else undefined (months are then UTC months). */
export function readZone(tz?: string | null) {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** "2026-10" for the month `d` falls in, in `timeZone` (UTC when not given). */
export function monthKeyOf(d: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone ?? 'UTC', year: 'numeric', month: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}`;
}

/** The last `months` month keys, oldest first, ending with the current month. */
export function monthKeys(months: number, now: Date, timeZone?: string) {
  const [y, m] = monthKeyOf(now, timeZone).split('-').map(Number);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * When a booking's earnings reached the vendor: released at payout, credited when a cancellation
 * left them something, else (a deposit released early) when it was paid.
 */
export function earnedOn(b: Pick<DashboardBooking, 'released_at' | 'payout_credited_at' | 'cancelled_at' | 'paid_at' | 'created_at'>) {
  return b.released_at ?? b.payout_credited_at ?? b.cancelled_at ?? b.paid_at ?? b.created_at;
}

/**
 * Earned per month and the top clients, with the same "earned" as the earnings page and payouts
 * (`bookingEarnings`: the vendor's part after commission, refunds taken off).
 */
export function summariseEarnings(bookings: DashboardBooking[], keys: string[], timeZone?: string, topN = 5) {
  const byMonth = new Map(keys.map((k) => [k, 0]));
  const clients = new Map<string, { id: string; name: string | null; avatar: string | null; earned: number; bookings: number }>();
  for (const b of bookings) {
    const { earned } = bookingEarnings(b);
    if (earned <= 0) continue;
    const key = monthKeyOf(earnedOn(b), timeZone);
    if (!byMonth.has(key)) continue;
    byMonth.set(key, byMonth.get(key)! + earned);
    const c = clients.get(b.customer_id) ?? { id: b.customer_id, name: b.customer?.name ?? null, avatar: b.customer?.avatar ?? null, earned: 0, bookings: 0 };
    c.earned += earned;
    c.bookings += 1;
    clients.set(b.customer_id, c);
  }
  const revenue_by_month = keys.map((month) => ({
    month,
    label: MONTH_NAMES[Number(month.slice(5, 7)) - 1],
    earned: round2(byMonth.get(month)!),
  }));
  const top_clients = [...clients.values()]
    .map((c) => ({ ...c, earned: round2(c.earned) }))
    .sort((a, b) => b.earned - a.earned || b.bookings - a.bookings)
    .slice(0, topN);
  return {
    revenue_by_month,
    total_earned: round2(revenue_by_month.reduce((s, m) => s + m.earned, 0)),
    top_clients,
  };
}
