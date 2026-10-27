import { PaymentPlan } from 'prisma/generated/enums';
import { checkCustomPlan, customRows, firstCharge, latestDueAt, PaymentPlanError, planSentence, readCustomPlan, splitEvenly, withPaymentPlan } from './custom-plan';
import { dueInstallment, dueKindFor } from './payment-due';

const DAY = 24 * 3600 * 1000;
const now = new Date('2026-10-27T12:00:00Z');
const at = (d: number) => new Date(now.getTime() + d * DAY);
const event = at(60);
// $4,000 vendor price + $200 Vendly fee
const ctx = { owed: 4200, feeOwed: 200, now, eventStart: event, eventEnd: new Date(event.getTime() + 5 * 3600e3) };
const fails = (fn: () => unknown, msg: RegExp) => {
  expect(fn).toThrow(PaymentPlanError);
  expect(fn).toThrow(msg);
};

describe('checkCustomPlan', () => {
  it('keeps a valid plan: the fee on the first payment, numbered, the first marked as the deposit', () => {
    const p = checkCustomPlan([{ amount: 2000 }, { amount: 1500, due_at: at(30) }, { amount: 700, due_at: at(53) }], ctx);
    expect(p).toEqual([
      { label: 'Payment 1 of 3 (deposit)', amount: 2000, fee_amount: 200, due_at: null },
      { label: 'Payment 2 of 3', amount: 1500, fee_amount: 0, due_at: at(30).toISOString() },
      { label: 'Payment 3 of 3', amount: 700, fee_amount: 0, due_at: at(53).toISOString() },
    ]);
  });

  it('has 2 to 12 payments', () => {
    fails(() => checkCustomPlan([{ amount: 4200 }], ctx), /2 to 12 payments/);
    const thirteen = Array.from({ length: 13 }, (_, k) => ({ amount: k === 0 ? 600 : 300, due_at: k ? at(k) : null }));
    fails(() => checkCustomPlan(thirteen, ctx), /2 to 12 payments/);
  });

  it('adds up exactly to what is owed, to the cent', () => {
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2199.99, due_at: at(10) }], ctx), /add up to \$4,199\.99, but \$4,200\.00 is the total/);
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2300, due_at: at(10) }], { ...ctx, paidCount: 1 }), /is still owed/);
    fails(() => checkCustomPlan([{ amount: 2000.005 }, { amount: 2200, due_at: at(10) }], ctx), /dollars and cents/);
  });

  it('needs at least $50 a payment, only the last may be a smaller remainder', () => {
    const c = { ...ctx, owed: 300, feeOwed: 15 };
    fails(() => checkCustomPlan([{ amount: 100 }, { amount: 40, due_at: at(5) }, { amount: 160, due_at: at(9) }], c), /Payment 2 must be at least \$50\.00/);
    expect(checkCustomPlan([{ amount: 140 }, { amount: 150, due_at: at(5) }, { amount: 10, due_at: at(9) }], c)).toHaveLength(3);
    fails(() => checkCustomPlan([{ amount: 299.6 }, { amount: 0.4, due_at: at(5) }], c), /at least \$0\.50/);
  });

  it('charges the fee with the first payment, so it is at least the fee plus $50', () => {
    fails(() => checkCustomPlan([{ amount: 240 }, { amount: 3960, due_at: at(10) }], ctx), /fee of \$200\.00, so it must be at least \$250\.00/);
    // no fee left to pay (a confirmed booking whose deposit carried it): only the $50 minimum
    expect(checkCustomPlan([{ amount: 50 }, { amount: 4150, due_at: at(10) }], { ...ctx, feeOwed: 0 })[0].fee_amount).toBe(0);
  });

  it('dates: only the first may be "when accepted", in the future, in order, the last by the event start', () => {
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2200 }], ctx), /Pick a date for payment 2/);
    fails(() => checkCustomPlan([{ amount: 2000, due_at: at(-1) }, { amount: 2200, due_at: at(5) }], ctx), /payment 1 has passed/);
    fails(() => checkCustomPlan([{ amount: 2000, due_at: at(10) }, { amount: 2200, due_at: at(10) }], ctx), /Payment 2 must be due after payment 1/);
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(61) }], { ...ctx, timeZone: 'America/Chicago' }), /must be due by the event start \(Sat, Dec 26, 2026\)/);
    // the first can also be on a date
    expect(checkCustomPlan([{ amount: 2000, due_at: at(2) }, { amount: 2200, due_at: event }], ctx)[0].due_at).toBe(at(2).toISOString());
  });

  it('a pay-after-service package can take payments up to 7 days after the event ends', () => {
    const end = new Date(event.getTime() + 5 * 3600e3);
    expect(latestDueAt({ ...ctx, payAfter: true })).toEqual(new Date(end.getTime() + 7 * DAY));
    expect(checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(66) }], { ...ctx, payAfter: true })).toHaveLength(2);
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(68) }], { ...ctx, payAfter: true }), /up to 7 days after the event/);
  });

  it('without an event date, payments can be up to a year away', () => {
    expect(checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(300) }], { ...ctx, eventStart: null, eventEnd: null })).toHaveLength(2);
    fails(() => checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(400) }], { ...ctx, eventStart: null, eventEnd: null }), /up to/);
  });

  it('on a booking with a payment made, numbering carries on and the deposit stays the paid one', () => {
    const p = checkCustomPlan([{ amount: 100 }, { amount: 100, due_at: at(9) }], { ...ctx, owed: 200, feeOwed: 0, paidCount: 1 });
    expect(p.map((x) => x.label)).toEqual(['Payment 2 of 3', 'Payment 3 of 3']);
  });

  it('refuses a remainder too small to split', () => {
    fails(() => checkCustomPlan([{ amount: 30 }, { amount: 20, due_at: at(3) }], { ...ctx, owed: 50, feeOwed: 0 }), /too little to split/);
  });
});

describe('plan helpers', () => {
  it('splits evenly with the leftover cents on the first payment', () => {
    expect(splitEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(splitEvenly(4200, 2)).toEqual([2100, 2100]);
  });

  it('turns an agreed plan into charges when the vendor accepts, or none when the total moved', () => {
    const plan = { pay_after: false, payments: checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(30) }], ctx) };
    const rows = customRows(plan, 4200, now)!;
    expect(rows.map((r) => [r.sequence, r.amount, r.fee_amount, r.due_at, r.capture_manually])).toEqual([
      [1, 2000, 200, now, false],
      [2, 2200, 0, at(30), false],
    ]);
    expect(customRows(plan, 4300, now)).toBeNull();
    // a date that passed before the vendor accepted is charged at once
    expect(customRows(plan, 4200, at(31))![1].due_at).toEqual(at(31));
    expect(readCustomPlan({ nope: true })).toBeNull();
  });

  it('writes the plan into Schedule A, replacing an earlier one', () => {
    const payments = checkCustomPlan([{ amount: 2000 }, { amount: 2200, due_at: at(30) }], ctx);
    const opts = { payments, first: 'accept' as const, timeZone: 'UTC', customerRole: 'Customer' };
    const once = withPaymentPlan('## Schedule A: Price at booking, add-ons and fees\n- Package: $4,000.00', opts);
    expect(once).toContain('### Payment plan');
    expect(once).toContain('- Payment 1 of 2 (deposit): $2,000.00 when the Vendor accepts (includes the Vendly Protection fee of $200.00)');
    expect(once).toContain('- Payment 2 of 2: $2,200.00 on Thu, Nov 26, 2026');
    expect(once).toContain('The first payment is the deposit: it is non-refundable');
    const twice = withPaymentPlan(once, opts);
    expect(twice.split('### Payment plan')).toHaveLength(2);
    expect(withPaymentPlan('', opts).startsWith('## Schedule A: Payment plan')).toBe(true);
    expect(planSentence(payments, 'now', 'UTC')).toBe('The amount due is paid in 2 payments through Vendly under the payment plan in Schedule A: $2,000.00 when this amendment is signed; $2,200.00 on Thu, Nov 26, 2026.');
  });

  it('the first charge (not one a plan replaced) is the deposit', () => {
    const rows = [
      { id: 'a', kind: 'charge', sequence: 1, status: 'CANCELLED' },
      { id: 'h', kind: 'security_deposit', sequence: 2, status: 'SCHEDULED' },
      { id: 'c', kind: 'charge', sequence: 4, status: 'SCHEDULED' },
      { id: 'b', kind: 'charge', sequence: 3, status: 'PAID' },
    ];
    expect(firstCharge(rows)?.id).toBe('b');
  });
});

describe('custom plans and the pending-payment window', () => {
  const custom = { payment_plan: PaymentPlan.CUSTOM, deposit_rules: true };
  it('the first charge fails as the deposit, later ones as the balance; add-ons never', () => {
    expect(dueKindFor(custom, { kind: 'charge', sequence: 3, first: true })).toBe('deposit');
    expect(dueKindFor(custom, { kind: 'charge', sequence: 4 })).toBe('balance');
    expect(dueKindFor(custom, { kind: 'extra', sequence: 5 })).toBeNull();
    // even on a booking made before the deposit rules
    expect(dueKindFor({ ...custom, deposit_rules: false }, { kind: 'charge', sequence: 1, first: true })).toBe('deposit');
  });

  it('finds the payment the window waits for', () => {
    const charges = [
      { sequence: 1, status: 'CANCELLED', attempts: 0 },
      { sequence: 2, status: 'PAID', attempts: 1 },
      { sequence: 3, status: 'PAID', attempts: 1 },
      { sequence: 4, status: 'FAILED', attempts: 1 },
      { sequence: 5, status: 'SCHEDULED', attempts: 0 },
    ];
    expect(dueInstallment({ ...custom, payment_due_kind: 'deposit' }, charges)?.sequence).toBe(2);
    expect(dueInstallment({ ...custom, payment_due_kind: 'balance' }, charges)?.sequence).toBe(4);
    // paid since: nothing is waiting
    expect(dueInstallment({ ...custom, payment_due_kind: 'balance' }, charges.map((c) => ({ ...c, status: c.status === 'FAILED' ? 'PAID' : c.status })))).toBeUndefined();
    // deposit plans keep their numbers
    expect(dueInstallment({ payment_plan: PaymentPlan.DEPOSIT_50, payment_due_kind: 'balance' }, charges)?.sequence).toBe(2);
  });
});
