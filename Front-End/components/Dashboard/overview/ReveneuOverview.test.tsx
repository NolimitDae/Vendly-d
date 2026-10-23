import { revenueByMonth } from './ReveneuOverview';

describe('revenue chart', () => {
  it("adds up Vendly's fees and commission per month", () => {
    const months = revenueByMonth([
      { date: '2026-01-03', fees: 10, commission: 2 },
      { date: '2026-01-20', fees: 5.5, commission: 0 },
      { date: '2026-03-01', fees: 0, commission: 7.25 },
    ]);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ name: 'Jan', amount: 17.5 });
    expect(months[1]).toEqual({ name: 'Feb', amount: 0 });
    expect(months[2]).toEqual({ name: 'Mar', amount: 7.25 });
  });
});
