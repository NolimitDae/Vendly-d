import { cancellationMessage, customerRefundPercent, settleCancellation } from './cancellation';

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

describe('cancellationMessage', () => {
  const base = { cancelled_by: 'CUSTOMER' as const, refund_total: 225, refund_fee: 0, fee_kept: 22.5, vendor_keeps: 225, policy: { key: 'flexible', label: 'Flexible', text: '' }, percent: 50, unpaid_cancelled: 0, holds_released: 0, card: null, paid: true };

  it('tells the customer what comes back and what is kept, before and after', () => {
    expect(cancellationMessage(base, 'CUSTOMER')).toBe(
      "You'll get $225.00 back to your card. The $22.50 Vendly Protection fee isn't refunded. The vendor keeps $225.00 under their flexible cancellation policy. Refunds take 5–10 business days to show.",
    );
    expect(cancellationMessage({ ...base, card: 'Visa •••• 4242' }, 'CUSTOMER', true)).toMatch(/^\$225\.00 is being refunded to your card \(Visa •••• 4242\)\./);
  });

  it('tells the vendor what they keep', () => {
    expect(cancellationMessage(base, 'VENDOR', true)).toBe('The customer is getting $225.00 back. You keep $225.00 under your flexible cancellation policy.');
    expect(cancellationMessage({ ...base, cancelled_by: 'VENDOR', refund_total: 472.5, refund_fee: 22.5, fee_kept: 0, vendor_keeps: 0 }, 'VENDOR')).toBe(
      'The customer gets $472.50 back, Vendly Protection fee included. You keep nothing from this booking.',
    );
  });

  it('says nothing is charged when nothing was paid', () => {
    expect(cancellationMessage({ ...base, refund_total: 0, fee_kept: 0, vendor_keeps: 0, unpaid_cancelled: 300, paid: false }, 'CUSTOMER')).toBe(
      "You haven't been charged, so there's nothing to refund. The $300.00 still to pay won't be charged.",
    );
  });
});
