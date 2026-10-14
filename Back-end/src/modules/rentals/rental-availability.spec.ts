import { availabilityCalendar, availableQuantity, parseDay, peakUsage, priceRental, rangeProblem, rentalDays } from './rental-availability';

const d = (s: string) => parseDay(s);
const res = (start: string, end: string, quantity: number) => ({ start_date: d(start), end_date: d(end), quantity });

describe('rental availability', () => {
  it('counts days inclusively', () => {
    expect(rentalDays(d('2026-11-10'), d('2026-11-10'))).toBe(1);
    expect(rentalDays(d('2026-11-10'), d('2026-11-12'))).toBe(3);
  });

  it('subtracts overlapping reservations', () => {
    const item = { quantity: 10, turnaround_hours: 0 };
    expect(availableQuantity(item, [res('2026-11-10', '2026-11-12', 4)], d('2026-11-11'), d('2026-11-11'))).toBe(6);
    expect(availableQuantity(item, [res('2026-11-10', '2026-11-12', 4)], d('2026-11-13'), d('2026-11-14'))).toBe(10);
  });

  it('blocks the turnaround either side', () => {
    const item = { quantity: 5, turnaround_hours: 24 };
    const r = [res('2026-11-10', '2026-11-12', 5)];
    expect(availableQuantity(item, r, d('2026-11-13'), d('2026-11-13'))).toBe(0); // the day after return is cleaning
    expect(availableQuantity(item, r, d('2026-11-09'), d('2026-11-09'))).toBe(0); // the day before pickup is prep
    expect(availableQuantity(item, r, d('2026-11-14'), d('2026-11-14'))).toBe(5);
  });

  it('uses the peak day, not the sum, for reservations that do not overlap each other', () => {
    const r = [res('2026-11-01', '2026-11-02', 6), res('2026-11-08', '2026-11-09', 6)];
    expect(peakUsage(r, d('2026-11-01'), d('2026-11-09'), 0)).toBe(6);
    expect(availableQuantity({ quantity: 10, turnaround_hours: 0 }, r, d('2026-11-01'), d('2026-11-09'))).toBe(4);
  });

  it('adds up reservations on the same day', () => {
    const r = [res('2026-11-01', '2026-11-03', 3), res('2026-11-03', '2026-11-05', 4)];
    expect(peakUsage(r, d('2026-11-01'), d('2026-11-05'), 0)).toBe(7);
  });

  it('never goes below zero', () => {
    expect(availableQuantity({ quantity: 2, turnaround_hours: 0 }, [res('2026-11-01', '2026-11-01', 5)], d('2026-11-01'), d('2026-11-01'))).toBe(0);
  });

  it('builds a day-by-day calendar', () => {
    const cal = availabilityCalendar({ quantity: 3, turnaround_hours: 0 }, [res('2026-11-02', '2026-11-02', 2)], d('2026-11-01'), 3);
    expect(cal).toEqual([
      { date: '2026-11-01', available: 3 },
      { date: '2026-11-02', available: 1 },
      { date: '2026-11-03', available: 3 },
    ]);
  });

  it('prices rate × days × quantity plus the deposit per unit', () => {
    expect(priceRental([{ daily_rate: 12.5, deposit_amount: 20, quantity: 4 }, { daily_rate: 100, deposit_amount: 0, quantity: 1 }], 3)).toEqual({ subtotal: 450, deposit: 80 });
  });

  it('rejects bad ranges', () => {
    const today = d('2026-11-01');
    expect(rangeProblem(d('2026-11-05'), d('2026-11-04'), today)).toMatch(/on or after/);
    expect(rangeProblem(d('2026-10-30'), d('2026-11-04'), today)).toMatch(/passed/);
    expect(rangeProblem(d('2026-11-01'), d('2027-03-01'), today)).toMatch(/at most/);
    expect(rangeProblem(d('2026-11-01'), d('2026-11-01'), today)).toBeNull();
  });
});
