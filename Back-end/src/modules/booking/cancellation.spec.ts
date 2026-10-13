import { customerRefundPercent, settleCancellation } from './cancellation';

const event = new Date('2026-06-14T15:00:00Z');
const before = (days: number, hours = 0) => new Date(event.getTime() - (days * 24 + hours) * 3600 * 1000);

describe('customerRefundPercent', () => {
  it.each([
    // [policy, days before, extra hours, expected %]
    ['flexible', 7, 0, 100],
    ['flexible', 6, 23, 50],
    ['flexible', 2, 0, 50],
    ['flexible', 1, 23, 0],
    ['moderate', 30, 0, 100],
    ['moderate', 29, 23, 50],
    ['moderate', 14, 0, 50],
    ['moderate', 13, 23, 0],
    ['strict', 60, 0, 50],
    ['strict', 59, 23, 0],
  ])('%s, %d days %d hours before the event: %d%%', (policy, days, hours, expected) => {
    expect(customerRefundPercent(policy, event, before(days, hours))).toBe(expected);
  });

  it('treats an unknown policy as moderate (the contract default)', () => {
    expect(customerRefundPercent(undefined, event, before(20))).toBe(50);
  });

  it('refunds in full when there is no event date to apply the policy to', () => {
    expect(customerRefundPercent('strict', null, before(1))).toBe(100);
  });

  it('refunds nothing after the event has started', () => {
    expect(customerRefundPercent('flexible', event, new Date(event.getTime() + 3600 * 1000))).toBe(0);
  });
});

describe('settleCancellation', () => {
  it('vendor cancels: full refund including the Vendly Protection fee', () => {
    expect(settleCancellation({ cancelledBy: 'VENDOR', amount: 1000, serviceFee: 50, cancelledAt: before(1) })).toEqual({
      refundTotal: 1050,
      refundVendorPrice: 1000,
      refundFee: 50,
      vendorKeeps: 0,
      percent: 100,
    });
  });

  it('customer cancels inside the 50% window: half the vendor price back, fee kept, vendor keeps the rest', () => {
    expect(
      settleCancellation({ cancelledBy: 'CUSTOMER', amount: 450, serviceFee: 22.5, policy: 'flexible', eventStart: event, cancelledAt: before(3) }),
    ).toEqual({ refundTotal: 225, refundVendorPrice: 225, refundFee: 0, vendorKeeps: 225, percent: 50 });
  });

  it('customer cancels too late: nothing refunded, vendor keeps the full price', () => {
    const s = settleCancellation({ cancelledBy: 'CUSTOMER', amount: 450, serviceFee: 22.5, policy: 'strict', eventStart: event, cancelledAt: before(5) });
    expect(s.refundTotal).toBe(0);
    expect(s.vendorKeeps).toBe(450);
  });

  it('rounds to the cent', () => {
    const s = settleCancellation({ cancelledBy: 'CUSTOMER', amount: 99.99, serviceFee: 5, policy: 'moderate', eventStart: event, cancelledAt: before(20) });
    expect(s.refundVendorPrice).toBe(50);
    expect(s.vendorKeeps).toBe(49.99);
  });
});
