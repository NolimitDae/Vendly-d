/**
 * Rental stock rules. Pure functions so the maths is unit-tested without a database.
 *
 * Dates are whole days (UTC midnight). A rental from the 10th to the 12th is three days and uses
 * the stock for [10th 00:00, 13th 00:00). The item's turnaround (cleaning, delivery) also blocks
 * the stock that many hours before pickup and after return.
 */

export const DAY_MS = 24 * 3600 * 1000;
export const MAX_RENTAL_DAYS = 60;

export interface ReservationLike {
  start_date: Date;
  end_date: Date;
  quantity: number;
}

/** "2026-11-03" (or an ISO string) → that day at UTC midnight. */
export function parseDay(value: string | Date): Date {
  const d = value instanceof Date ? new Date(value) : new Date(String(value).slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Inclusive number of days, minimum 1. */
export function rentalDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / DAY_MS) + 1);
}

/** The time window a reservation keeps stock out of circulation, turnaround included. */
export function blockedWindow(r: { start_date: Date; end_date: Date }, turnaroundHours: number): [number, number] {
  const pad = Math.max(0, turnaroundHours) * 3600 * 1000;
  return [parseDay(r.start_date).getTime() - pad, parseDay(r.end_date).getTime() + DAY_MS + pad];
}

/**
 * Most units in use on any single day of [start, end]. Reservations that touch the range but not
 * each other don't add up, so a 10-chair item can serve two 6-chair rentals a week apart.
 */
export function peakUsage(reservations: ReservationLike[], start: Date, end: Date, turnaroundHours: number): number {
  const s = parseDay(start).getTime();
  const days = rentalDays(start, end);
  const windows = reservations.map((r) => ({ w: blockedWindow(r, turnaroundHours), q: r.quantity }));
  let peak = 0;
  for (let i = 0; i < days; i++) {
    const dayStart = s + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const used = windows.reduce((sum, { w, q }) => (w[0] < dayEnd && w[1] > dayStart ? sum + q : sum), 0);
    if (used > peak) peak = used;
  }
  return peak;
}

/** Units still free for the whole of [start, end]. */
export function availableQuantity(item: { quantity: number; turnaround_hours: number }, reservations: ReservationLike[], start: Date, end: Date): number {
  return Math.max(0, item.quantity - peakUsage(reservations, start, end, item.turnaround_hours));
}

/** Day-by-day free stock, for calendars. */
export function availabilityCalendar(
  item: { quantity: number; turnaround_hours: number },
  reservations: ReservationLike[],
  from: Date,
  days: number,
): { date: string; available: number }[] {
  const s = parseDay(from);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(s.getTime() + i * DAY_MS);
    return { date: d.toISOString().slice(0, 10), available: availableQuantity(item, reservations, d, d) };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RentalLine {
  daily_rate: number;
  deposit_amount: number;
  quantity: number;
}

/** Rental price (Σ rate × days × qty) and refundable deposit (Σ deposit × qty). */
export function priceRental(lines: RentalLine[], days: number) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.daily_rate * l.quantity * days, 0));
  const deposit = round2(lines.reduce((sum, l) => sum + l.deposit_amount * l.quantity, 0));
  return { subtotal, deposit };
}

/** Validates a requested range; returns an error message or null. */
export function rangeProblem(start: Date, end: Date, today = new Date()): string | null {
  const s = parseDay(start).getTime();
  const e = parseDay(end).getTime();
  if (e < s) return 'The return date must be on or after the pickup date.';
  // a day of grace: the customer's 'today' can be the UTC day before (evenings in the Americas)
  if (s < parseDay(today).getTime() - DAY_MS) return 'The pickup date has already passed.';
  if (rentalDays(start, end) > MAX_RENTAL_DAYS) return `Rentals can be at most ${MAX_RENTAL_DAYS} days.`;
  return null;
}
