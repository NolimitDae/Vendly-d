import { PaymentDeadlinesService } from './payment-deadlines.service';

const HOUR = 3600 * 1000;

function setup() {
  const prisma: any = {
    booking: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const payments: any = { notifyPaymentDue: jest.fn().mockResolvedValue(undefined) };
  const bookings: any = { cancelForNonPayment: jest.fn().mockResolvedValue({ success: true }) };
  return { service: new PaymentDeadlinesService(prisma, payments, bookings), prisma, payments, bookings };
}

describe('PaymentDeadlinesService', () => {
  const now = new Date('2026-11-01T12:00:00Z');

  it('reminds once with about 2 hours left', async () => {
    const { service, prisma, payments } = setup();
    const dueBy = new Date(now.getTime() + 90 * 60_000);
    const row = { id: 'b1', customer_id: 'c1', payment_due_by: dueBy, payment_due_kind: 'balance', listing: { title: 'DJ set' }, customer: { email: 'c@x.com', name: 'Cee' }, installments: [{ sequence: 2, amount: '600.00' }] };
    prisma.booking.findMany.mockResolvedValueOnce([row]);

    expect(await service.remind(now)).toBe(1);

    // the widest window (large bookings: 6 hours); each booking's own is checked after
    expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({ payment_due_reminded_at: null, payment_due_by: { gt: now, lte: new Date(now.getTime() + 6 * HOUR) } });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b1', payment_due_reminded_at: null, payment_due_by: dueBy }, data: { payment_due_reminded_at: now } });
    expect(payments.notifyPaymentDue).toHaveBeenCalledWith(row, { kind: 'balance', amount: 600, dueBy, reminder: true });

    // another server already sent it
    prisma.booking.findMany.mockResolvedValueOnce([row]);
    prisma.booking.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.remind(now)).toBe(0);
  });

  it('large bookings are reminded with about 6 hours left, others only in their last 2 hours', async () => {
    const { service, prisma, payments } = setup();
    const dueBy = new Date(now.getTime() + 5 * HOUR);
    const base = { customer_id: 'c1', payment_due_by: dueBy, payment_due_kind: 'deposit', listing: { title: 'Gala' }, customer: { email: 'c@x.com', name: 'Cee' }, installments: [{ sequence: 1, amount: '3000.00' }] };
    const large = { ...base, id: 'big', amount: 6000, service_fee: 300 };
    const small = { ...base, id: 'small', amount: 1000, service_fee: 50 };
    prisma.booking.findMany.mockResolvedValueOnce([large, small]);

    expect(await service.remind(now)).toBe(1);
    expect(payments.notifyPaymentDue).toHaveBeenCalledWith(large, expect.objectContaining({ reminder: true }));
    expect(payments.notifyPaymentDue).not.toHaveBeenCalledWith(small, expect.anything());
    expect(prisma.booking.updateMany).toHaveBeenCalledTimes(1);
  });

  it('cancels bookings still unpaid at the deadline', async () => {
    const { service, prisma, bookings } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([{ id: 'b1', payment_due_kind: 'deposit', installments: [{ sequence: 1, status: 'FAILED' }, { sequence: 2, status: 'SCHEDULED' }] }]);
    expect(await service.cancelOverdue(now)).toBe(1);
    expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({ payment_due_by: { lte: now } });
    expect(bookings.cancelForNonPayment).toHaveBeenCalledWith('b1', now);
  });

  it('leaves disputed bookings and charges still going through out of the batch, so they never crowd out the rest', async () => {
    const { service, prisma } = setup();
    await service.cancelOverdue(now);
    expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }],
      installments: { none: { kind: 'charge', status: 'PROCESSING' } },
    });
  });

  it('leaves a charge still going through for the next run, and clears one that was paid', async () => {
    const { service, prisma, bookings } = setup();
    prisma.booking.findMany.mockResolvedValueOnce([
      { id: 'b1', payment_due_kind: 'deposit', installments: [{ sequence: 1, status: 'PROCESSING' }] },
      { id: 'b2', payment_due_kind: 'balance', installments: [{ sequence: 1, status: 'PAID' }, { sequence: 2, status: 'PAID' }] },
    ]);
    expect(await service.cancelOverdue(now)).toBe(0);
    expect(bookings.cancelForNonPayment).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({ where: { id: 'b2', payment_due_by: { lte: now } }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
  });

  it('a booking that can no longer be cancelled is skipped, not fatal', async () => {
    const { service, prisma, bookings } = setup();
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    prisma.booking.findMany.mockResolvedValueOnce([
      { id: 'b1', payment_due_kind: 'deposit', installments: [{ sequence: 1, status: 'FAILED' }] },
      { id: 'b2', payment_due_kind: 'deposit', installments: [{ sequence: 1, status: 'FAILED' }] },
    ]);
    bookings.cancelForNonPayment.mockRejectedValueOnce(new Error('already cancelled'));
    expect(await service.cancelOverdue(now)).toBe(1);
    expect(bookings.cancelForNonPayment).toHaveBeenCalledTimes(2);
  });
});
