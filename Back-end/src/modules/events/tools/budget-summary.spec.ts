import { summariseBudget, type BudgetBooking, type BudgetLine } from './budget-summary';

const booking = (over: Partial<BudgetBooking> = {}): BudgetBooking => ({
  id: 'b1', status: 'CONFIRMED', amount: 1000, service_fee: 50, paid: 525, vendor_name: 'Nia Glam', title: 'Bridal Glam', category: 'Beauty', ...over,
});
const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({ id: 'l1', category: 'Beauty', allocated: 1200, spent: 0, note: null, booking_id: null, ...over });

describe('summariseBudget', () => {
  it('follows real payments on booked lines', () => {
    const s = summariseBudget(10000, [line({ booking_id: 'b1', spent: 999 })], [booking()]);
    expect(s.lines[0]).toMatchObject({ spent: 525, committed: 1050, booking: { vendor_name: 'Nia Glam' } });
    expect(s).toMatchObject({ committed: 1050, spent: 525, remaining: 8950, over_budget: false });
  });

  it('keeps manual lines as entered', () => {
    const s = summariseBudget(null, [line({ id: 'm', category: 'Tips', allocated: 300, spent: 120 })], []);
    expect(s).toMatchObject({ allocated: 300, committed: 300, spent: 120, remaining: null });
  });

  it('lists accepted bookings that are not on a budget line yet', () => {
    const s = summariseBudget(2000, [], [booking({ id: 'b2', status: 'COMPLETED', paid: 1050 }), booking({ id: 'b3', status: 'PENDING' })]);
    expect(s.unassigned_bookings.map((u) => u.id)).toEqual(['b2']);
    expect(s).toMatchObject({ committed: 1050, spent: 1050, remaining: 950 });
  });

  it('a cancelled booking stops counting as committed but its payments stay visible', () => {
    const s = summariseBudget(500, [line({ booking_id: 'b1', allocated: 1050 })], [booking({ status: 'CANCELLED', paid: 100 })]);
    expect(s.lines[0]).toMatchObject({ committed: 0, spent: 100 });
  });

  it('flags going over budget', () => {
    expect(summariseBudget(800, [], [booking()]).over_budget).toBe(true);
  });
});
