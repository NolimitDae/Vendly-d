import { PaymentPlan } from 'prisma/generated/enums';
import { buildSchedule } from './payment-schedule';

const DAY = 24 * 3600 * 1000;
const now = new Date('2026-10-14T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * DAY);

describe('buildSchedule', () => {
  it('charges everything on accept for the full plan, fee included', () => {
    const s = buildSchedule({ plan: PaymentPlan.FULL_ON_ACCEPT, price: 450, serviceFee: 22.5, eventStart: inDays(30), acceptedAt: now });
    expect(s).toEqual([expect.objectContaining({ sequence: 1, amount: 472.5, fee_amount: 22.5, due_at: now, capture_manually: false })]);
  });

  it('splits a 50% deposit now and the balance 7 days before the event', () => {
    const s = buildSchedule({ plan: PaymentPlan.DEPOSIT_50, price: 450, serviceFee: 22.5, eventStart: inDays(30), acceptedAt: now });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ label: '50% deposit', amount: 247.5, fee_amount: 22.5, due_at: now });
    expect(s[1]).toMatchObject({ label: 'Balance', amount: 225, fee_amount: 0, due_at: inDays(23) });
  });

  it('splits a 25% deposit with the balance 14 days before the event', () => {
    const s = buildSchedule({ plan: PaymentPlan.DEPOSIT_25, price: 1000, serviceFee: 50, eventStart: inDays(60), acceptedAt: now });
    expect(s[0]).toMatchObject({ amount: 300, fee_amount: 50 });
    expect(s[1]).toMatchObject({ amount: 750, due_at: inDays(46) });
  });

  it('merges the balance into the deposit when the event is sooner than the lead time', () => {
    const s = buildSchedule({ plan: PaymentPlan.DEPOSIT_50, price: 450, serviceFee: 22.5, eventStart: inDays(5), acceptedAt: now });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ label: 'Full payment', amount: 472.5 });
  });

  it('falls back to full payment when a deposit plan has no event date', () => {
    const s = buildSchedule({ plan: PaymentPlan.DEPOSIT_25, price: 100, serviceFee: 5, eventStart: null, acceptedAt: now });
    expect(s).toHaveLength(1);
    expect(s[0].amount).toBe(105);
  });

  it('holds the card at the event start for pay-after-service', () => {
    const s = buildSchedule({ plan: PaymentPlan.PAY_AFTER_SERVICE, price: 200, serviceFee: 10, eventStart: inDays(10), acceptedAt: now });
    expect(s).toEqual([expect.objectContaining({ amount: 210, due_at: inDays(10), capture_manually: true })]);
  });

  it('treats a missing plan as full payment on accept', () => {
    expect(buildSchedule({ plan: null, price: 80, serviceFee: 4, acceptedAt: now })[0]).toMatchObject({ amount: 84, due_at: now });
  });

  it('never leaves a cent behind when splitting odd prices', () => {
    const s = buildSchedule({ plan: PaymentPlan.DEPOSIT_25, price: 99.99, serviceFee: 5, eventStart: inDays(60), acceptedAt: now });
    expect(s[0].amount + s[1].amount).toBeCloseTo(104.99, 2);
  });
});
