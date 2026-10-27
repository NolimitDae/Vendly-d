import { ConflictException } from '@nestjs/common';
import { replaceUnpaidCharges, unpaidCharges } from './custom-plan-charges';

const now = new Date('2026-10-27T12:00:00Z');
const later = new Date('2026-11-20T12:00:00Z');

const row = (o: Record<string, unknown>) => ({ id: String(o.id), kind: 'charge', sequence: 1, status: 'SCHEDULED', amount: 0, fee_amount: 0, due_at: now, ...o });

function fakeTx(installments: ReturnType<typeof row>[]) {
  const created: any[] = [];
  const tx = {
    booking: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'usd', installments }),
      update: jest.fn().mockResolvedValue({}),
    },
    bookingInstallment: {
      updateMany: jest.fn().mockImplementation(async ({ where }: any) => ({ count: where.id.in.length })),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        created.push(data);
        return { id: `new-${created.length}`, ...data };
      }),
    },
  };
  return { tx: tx as any, created };
}

// a 50% deposit plan: the deposit (with the $25 fee) paid, the $500 balance still to come; a rental hold and a paid add-on
const booking = () => [
  row({ id: 'dep', sequence: 1, status: 'PAID', amount: 525, fee_amount: 25 }),
  row({ id: 'bal', sequence: 2, status: 'FAILED', amount: 500 }),
  row({ id: 'hold', sequence: 3, kind: 'security_deposit', status: 'SCHEDULED', amount: 200 }),
  row({ id: 'extra', sequence: 4, kind: 'extra', status: 'PAID', amount: 60 }),
];
const payments = [
  { label: 'Payment 2 of 3', amount: 300, fee_amount: 0, due_at: null },
  { label: 'Payment 3 of 3', amount: 200, fee_amount: 0, due_at: later.toISOString() },
];

describe('unpaidCharges', () => {
  it('is what is still to be charged towards the price', () => {
    expect(unpaidCharges(booking())).toMatchObject({ owed: 500, feeOwed: 0, inFlight: false, paidCount: 1 });
    expect(unpaidCharges([row({ id: 'x', status: 'PROCESSING', amount: 10 })]).inFlight).toBe(true);
  });
});

describe('replaceUnpaidCharges', () => {
  it('cancels only the unpaid charges and adds the plan after them; paid ones, add-ons and holds stay', async () => {
    const { tx, created } = fakeTx(booking());
    await replaceUnpaidCharges(tx, 'b1', { pay_after: false, payments, owed: 500 }, now);
    expect(tx.bookingInstallment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.bookingInstallment.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ['bal'] } }, data: { status: 'CANCELLED' } });
    expect(created.map((c) => [c.sequence, c.label, c.amount, c.fee_amount, c.due_at, c.kind])).toEqual([
      [5, 'Payment 2 of 3', 300, 0, now, 'charge'],
      [6, 'Payment 3 of 3', 200, 0, later, 'charge'],
    ]);
    // the booking is on the custom plan, and a missed payment it replaced no longer counts down
    expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({ payment_plan: 'CUSTOM', custom_payment_plan: { pay_after: false, payments }, payment_due_by: null, payment_due_kind: null });
  });

  it('refuses when the money moved since the plan was proposed, or a payment is going through', async () => {
    const changed = fakeTx(booking());
    await expect(replaceUnpaidCharges(changed.tx, 'b1', { pay_after: false, payments, owed: 450 }, now)).rejects.toBeInstanceOf(ConflictException);
    expect(changed.created).toHaveLength(0);
    const busy = fakeTx([...booking(), row({ id: 'p', sequence: 5, status: 'PROCESSING', amount: 1 })]);
    await expect(replaceUnpaidCharges(busy.tx, 'b1', { pay_after: false, payments, owed: 500 }, now)).rejects.toThrow(/going through/);
  });

  it('refuses when a charge started between reading and cancelling', async () => {
    const { tx, created } = fakeTx(booking());
    tx.bookingInstallment.updateMany.mockResolvedValue({ count: 0 });
    await expect(replaceUnpaidCharges(tx, 'b1', { pay_after: false, payments, owed: 500 }, now)).rejects.toThrow(/just started/);
    expect(created).toHaveLength(0);
  });
});
