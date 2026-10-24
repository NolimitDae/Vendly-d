import { cancellationMessage, customerRefundPercent, depositPlanVendorOwed, settleCancellation } from './cancellation';

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

  it('never says a refund that failed is on its way', () => {
    // nothing went back
    expect(cancellationMessage({ ...base, refund_total: 0, refund_failed: 225 }, 'CUSTOMER', true)).toBe(
      "We couldn't refund $225.00 to your card straight away. Vendly will follow up with you about it. The $22.50 Vendly Protection fee isn't refunded. The vendor keeps $225.00 under their flexible cancellation policy.",
    );
    // part went back
    expect(cancellationMessage({ ...base, refund_total: 100, refund_failed: 125 }, 'CUSTOMER', true)).toMatch(/^\$100\.00 is being refunded to your card\. We couldn't refund \$125\.00/);
    expect(cancellationMessage({ ...base, refund_total: 0, refund_failed: 225 }, 'VENDOR', true)).toBe(
      "A refund of $225.00 to the customer didn't go through straight away; Vendly is following it up. You keep $225.00 under your flexible cancellation policy.",
    );
  });
});

describe('depositPlanVendorOwed (deposit kept, rest by policy)', () => {
  // $1,000 price on a 50% deposit plan: $500 deposit, $500 balance
  it('only the deposit paid: the vendor keeps it even when the policy would refund in full', () => {
    expect(depositPlanVendorOwed({ vendorPaid: 500, depositPaid: 500, feesAgreed: 0, percent: 100 })).toEqual({ owed: 500, depositKept: 500 });
  });

  it('deposit and balance paid: the deposit is kept, the balance is refunded by the policy tier', () => {
    expect(depositPlanVendorOwed({ vendorPaid: 1000, depositPaid: 500, feesAgreed: 0, percent: 100 })).toEqual({ owed: 500, depositKept: 500 });
    expect(depositPlanVendorOwed({ vendorPaid: 1000, depositPaid: 500, feesAgreed: 0, percent: 50 })).toEqual({ owed: 750, depositKept: 500 });
    expect(depositPlanVendorOwed({ vendorPaid: 1000, depositPaid: 500, feesAgreed: 0, percent: 0 })).toEqual({ owed: 1000, depositKept: 500 });
  });

  it('fees agreed after booking stay the vendor’s in full, and nothing beyond what was paid is kept', () => {
    expect(depositPlanVendorOwed({ vendorPaid: 1100, depositPaid: 500, feesAgreed: 100, percent: 100 })).toEqual({ owed: 600, depositKept: 500 });
    expect(depositPlanVendorOwed({ vendorPaid: 500, depositPaid: 500, feesAgreed: 100, percent: 100 })).toEqual({ owed: 500, depositKept: 500 });
  });

  it('nothing paid: nothing kept', () => {
    expect(depositPlanVendorOwed({ vendorPaid: 0, depositPaid: 0, feesAgreed: 0, percent: 0 })).toEqual({ owed: 0, depositKept: 0 });
  });
});

describe('cancellationMessage with a non-refundable deposit', () => {
  const base = { cancelled_by: 'CUSTOMER' as const, refund_total: 250, refund_fee: 0, fee_kept: 50, vendor_keeps: 750, deposit_kept: 500, policy: { key: 'moderate', label: 'Moderate', text: '' }, percent: 50, unpaid_cancelled: 0, holds_released: 0, card: null, paid: true };

  it('tells the customer clearly that the deposit is non-refundable, and what the policy keeps on top', () => {
    expect(cancellationMessage(base, 'CUSTOMER')).toBe(
      "You'll get $250.00 back to your card. The $50.00 Vendly Protection fee isn't refunded. Your deposit of $500.00 is non-refundable. The vendor keeps another $250.00 under their moderate cancellation policy. Refunds take 5–10 business days to show.",
    );
    expect(cancellationMessage({ ...base, refund_total: 0, vendor_keeps: 500, unpaid_cancelled: 500 }, 'CUSTOMER')).toBe(
      "You won't get a refund. The $50.00 Vendly Protection fee isn't refunded. Your deposit of $500.00 is non-refundable. The $500.00 still to pay won't be charged.",
    );
  });

  it('tells the vendor they keep the deposit', () => {
    expect(cancellationMessage(base, 'VENDOR', true)).toBe('The customer is getting $250.00 back. You keep the $500.00 deposit, plus $250.00 under your moderate cancellation policy.');
    expect(cancellationMessage({ ...base, refund_total: 0, vendor_keeps: 500 }, 'VENDOR')).toBe('Nothing is refunded to the customer. You keep the $500.00 deposit.');
  });

  it('never mentions a deposit on a vendor’s own cancellation', () => {
    expect(cancellationMessage({ ...base, cancelled_by: 'VENDOR', refund_total: 1050, refund_fee: 50, fee_kept: 0, vendor_keeps: 0 }, 'CUSTOMER')).not.toContain('deposit');
  });
});
