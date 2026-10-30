import { BookingStatus, PaymentPlan } from 'prisma/generated/enums';
import { autoRetryAt, deadlineText, dueKindFor, paymentDueBy, paymentState } from './payment-due';

const HOUR = 3600 * 1000;

describe('dueKindFor', () => {
  const deposit50 = { payment_plan: PaymentPlan.DEPOSIT_50, deposit_rules: true };

  it('the first charge of a deposit plan is the deposit, the second the balance', () => {
    expect(dueKindFor(deposit50, { kind: 'charge', sequence: 1 })).toBe('deposit');
    expect(dueKindFor({ ...deposit50, payment_plan: PaymentPlan.DEPOSIT_25 }, { kind: 'charge', sequence: 2 })).toBe('balance');
  });

  it('a package\'s own deposit follows the deposit rules, except a balance charged after the service', () => {
    const custom = { payment_plan: PaymentPlan.DEPOSIT_CUSTOM, deposit_rules: true };
    expect(dueKindFor(custom, { kind: 'charge', sequence: 1 })).toBe('deposit');
    expect(dueKindFor(custom, { kind: 'charge', sequence: 2 })).toBe('balance');
    expect(dueKindFor(custom, { kind: 'charge', sequence: 2, after_service: true })).toBeNull();
  });

  it('other plans, add-ons, rental holds and bookings made before the rules keep the old retries', () => {
    expect(dueKindFor({ ...deposit50, payment_plan: PaymentPlan.FULL_ON_ACCEPT }, { kind: 'charge', sequence: 1 })).toBeNull();
    expect(dueKindFor({ ...deposit50, payment_plan: PaymentPlan.PAY_AFTER_SERVICE }, { kind: 'charge', sequence: 1 })).toBeNull();
    expect(dueKindFor(deposit50, { kind: 'extra', sequence: 3 })).toBeNull();
    expect(dueKindFor(deposit50, { kind: 'security_deposit', sequence: 2 })).toBeNull();
    expect(dueKindFor({ ...deposit50, deposit_rules: false }, { kind: 'charge', sequence: 1 })).toBeNull();
  });
});

describe('deadline and retry', () => {
  const now = new Date('2026-11-01T12:00:00Z');

  it('gives 12 hours, with one automatic retry about 6 hours in', () => {
    const due = paymentDueBy(now);
    expect(due.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(autoRetryAt(now, due)?.toISOString()).toBe('2026-11-01T18:00:00.000Z');
  });

  it('skips the retry when it would land too close to the deadline', () => {
    expect(autoRetryAt(now, new Date(now.getTime() + 6 * HOUR))).toBeNull();
  });

  it('says the deadline in the customer’s time zone', () => {
    expect(deadlineText(new Date('2026-11-02T00:00:00Z'), 'America/New_York')).toBe('7:00 PM EST on Sun, Nov 1');
    expect(deadlineText(new Date('2026-11-02T00:00:00Z'), 'Not/AZone')).toBe('12:00 AM UTC on Mon, Nov 2');
  });
});

describe('paymentState', () => {
  const due = new Date();
  it('pending deposit or balance while the booking is confirmed or in progress', () => {
    expect(paymentState({ status: BookingStatus.CONFIRMED, payment_due_by: due, payment_due_kind: 'deposit' })).toBe('pending_deposit');
    expect(paymentState({ status: BookingStatus.IN_PROGRESS, payment_due_by: due, payment_due_kind: 'balance' })).toBe('pending_balance');
  });
  it('nothing without a deadline or once the booking ended', () => {
    expect(paymentState({ status: BookingStatus.CONFIRMED, payment_due_by: null, payment_due_kind: 'deposit' })).toBeNull();
    expect(paymentState({ status: BookingStatus.CANCELLED, payment_due_by: due, payment_due_kind: 'deposit' })).toBeNull();
  });
});
