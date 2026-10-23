import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

const d = (s: string) => new Date(`${s}T12:00:00Z`);

const inst = (over: Record<string, unknown>) => ({
  id: 'i1', label: 'Full payment', kind: 'charge', status: 'PAID', amount: 472.5, fee_amount: 22.5, refunded_amount: 0,
  capture_manually: false, paid_at: d('2026-09-01'), paid_out_at: null, updated_at: d('2026-09-01'), attempts: 1, extra: null,
  ...over,
});

const booking = (over: Record<string, unknown>) => ({
  id: 'b1', status: 'COMPLETED', amount: 450, service_fee: 22.5, currency: 'usd', paid_at: d('2026-09-01'), released_at: null, payout_credited_at: null, transfer_id: null,
  listing: { title: 'Bridal Glam' }, rental_reservations: [], customer: { name: 'Amara' }, installments: [],
  ...over,
});

function setup(data: { bookings?: any[]; txs?: any[]; extraBookings?: any[] }) {
  const prisma = {
    booking: { findMany: jest.fn().mockResolvedValueOnce(data.bookings ?? []).mockResolvedValue(data.extraBookings ?? []) },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue(data.txs ?? []) },
  };
  return { service: new TransactionsService(prisma as any), prisma };
}

describe('GET /payments/transactions', () => {
  describe('customer', () => {
    const customer = { id: 'c1', type: 'CUSTOMER' };
    const bookings = [
      // a payment plan: deposit paid then partly refunded on cancellation, balance never charged
      booking({
        id: 'b1', status: 'CANCELLED',
        installments: [
          inst({ id: 'dep', label: '50% deposit', amount: 247.5, fee_amount: 22.5, refunded_amount: 112.5, paid_at: d('2026-09-01'), updated_at: d('2026-09-10') }),
          inst({ id: 'bal', label: 'Balance', amount: 225, fee_amount: 0, status: 'CANCELLED', paid_at: null }),
        ],
      }),
      // an approved fee charged after the job
      booking({
        id: 'b2', listing: { title: 'DJ Night' },
        installments: [
          inst({ id: 'full', label: 'Full payment', amount: 315, fee_amount: 15, paid_at: d('2026-08-01') }),
          inst({ id: 'fee', label: 'Fee: Overtime', kind: 'extra', amount: 60, fee_amount: 0, paid_at: d('2026-08-20'), extra: { kind: 'FEE' } }),
          inst({ id: 'late', label: 'Add-on: Lights', kind: 'extra', amount: 105, fee_amount: 5, status: 'FAILED', attempts: 3, paid_at: null, updated_at: d('2026-08-21'), extra: { kind: 'ADD_ON' } }),
        ],
      }),
      // paid through hosted Checkout before installments
      booking({ id: 'old', listing: { title: 'Legacy Cake' }, paid_at: d('2026-07-01'), amount: 100, service_fee: 5 }),
    ];
    const legacyRefund = { id: 't9', created_at: d('2026-07-05'), type: 'booking_refund', status: 'refunded', amount: 50, currency: 'usd', order_id: 'old' };

    it('lists charges (money out) and refunds (money in), newest first', async () => {
      const { service } = setup({ bookings, txs: [legacyRefund] });
      const res = await service.list(customer, {});
      expect(res.meta).toMatchObject({ total: 7, role: 'customer' });
      expect(res.data.map((r) => [r.id, r.type, r.amount, r.status])).toEqual([
        ['refund-dep', 'refund', 112.5, 'completed'],
        ['charge-dep', 'payment', -247.5, 'completed'],
        ['failed-late', 'payment', -105, 'failed'],
        ['charge-fee', 'fee', -60, 'completed'],
        ['charge-full', 'payment', -315, 'completed'],
        ['tx-t9', 'refund', 50, 'completed'],
        ['charge-old', 'payment', -105, 'completed'],
      ]);
      expect(res.data[0]).toMatchObject({ booking_id: 'b1', booking_title: 'Bridal Glam', description: 'Refund: 50% deposit', currency: 'usd' });
      expect(res.data.find((r) => r.id === 'tx-t9')).toMatchObject({ booking_id: 'old', booking_title: 'Legacy Cake' });
      // failed charges moved no money
      expect(res.totals).toEqual({ in: 162.5, out: 727.5 });
    });

    it('filters by type, date and booking title, and pages', async () => {
      const { service } = setup({ bookings, txs: [legacyRefund] });
      expect((await service.list(customer, { type: 'refund' })).data.map((r) => r.id)).toEqual(['refund-dep', 'tx-t9']);
      expect((await setup({ bookings, txs: [legacyRefund] }).service.list(customer, { type: 'fee' })).data.map((r) => r.id)).toEqual(['charge-fee']);
      expect((await setup({ bookings, txs: [legacyRefund] }).service.list(customer, { q: 'dj' })).data.map((r) => r.id)).toEqual(['failed-late', 'charge-fee', 'charge-full']);
      expect((await setup({ bookings, txs: [legacyRefund] }).service.list(customer, { from: '2026-08-01', to: '2026-08-20' })).data.map((r) => r.id)).toEqual(['charge-fee', 'charge-full']);
      const page2 = await setup({ bookings, txs: [legacyRefund] }).service.list(customer, { page: 2, limit: 3 });
      expect(page2.data.map((r) => r.id)).toEqual(['charge-fee', 'charge-full', 'tx-t9']);
      expect(page2.meta).toMatchObject({ page: 2, limit: 3, total: 7, last_page: 3 });
    });

    it('rejects an unknown type or a bad date', async () => {
      await expect(setup({}).service.list(customer, { type: 'bogus' })).rejects.toThrow(BadRequestException);
      await expect(setup({}).service.list(customer, { from: 'yesterday' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('vendor', () => {
    const vendor = { id: 'v1', type: 'VENDOR' };
    const bookings = [
      // released: paid out to the bank, commission taken, some given back afterwards
      booking({ id: 'b1', released_at: d('2026-09-05'), transfer_id: 'tr_1', installments: [inst({ id: 'p1', paid_out_at: d('2026-09-05'), refunded_amount: 20 })] }),
      // still held until the job is released
      booking({ id: 'b2', status: 'CONFIRMED', listing: { title: 'DJ Night' }, customer: { name: 'Ben' }, installments: [inst({ id: 'p2', amount: 210, fee_amount: 10, paid_at: d('2026-10-01') })] }),
    ];
    const txs = [
      // an older payout row: linked through the booking's transfer id
      { id: 't1', created_at: d('2026-09-05'), type: 'booking_payout', status: 'succeeded', amount: 405, currency: 'usd', order_id: null, reference_number: 'tr_1' },
      { id: 't2', created_at: d('2026-09-05'), type: 'vendly_commission', status: 'succeeded', amount: 45, currency: 'usd', order_id: null, reference_number: 'b1' },
      { id: 't3', created_at: d('2026-09-07'), type: 'vendor_give_back', status: 'succeeded', amount: 20, currency: 'usd', order_id: null, reference_number: 'b1' },
      { id: 't4', created_at: d('2026-09-07'), type: 'payout_recovery', status: 'succeeded', amount: -18, currency: 'usd', order_id: null, reference_number: 'b1' },
      { id: 't5', created_at: d('2026-09-07'), type: 'vendly_commission', status: 'succeeded', amount: -2, currency: 'usd', order_id: 'b1', reference_number: 'b1' },
      { id: 't6', created_at: d('2026-09-20'), type: 'withdraw', status: 'completed', amount: 100, currency: 'usd', order_id: null, reference_number: 'tr_w' },
      // a booking paid outside this list (looked up by its id)
      { id: 't7', created_at: d('2026-06-01'), type: 'booking_earning', status: 'succeeded', amount: 80, currency: 'usd', order_id: null, reference_number: 'b-old' },
    ];

    it('lists payments received, payouts, commission, money back, recoveries and withdrawals', async () => {
      const { service, prisma } = setup({ bookings, txs, extraBookings: [booking({ id: 'b-old', paid_at: null, listing: { title: 'Old Gig' } })] });
      const res = await service.list(vendor, {});
      expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: 'v1' }) }));
      const byId = Object.fromEntries(res.data.map((r) => [r.id, r]));
      expect(byId['pay-p2']).toMatchObject({ type: 'payment', amount: 200, status: 'pending', description: 'Full payment from Ben', booking_title: 'DJ Night' });
      expect(byId['pay-p1']).toMatchObject({ type: 'payment', amount: 450, status: 'completed' });
      expect(byId['refund-p1']).toMatchObject({ type: 'refund', amount: -20 });
      expect(byId['tx-t1']).toMatchObject({ type: 'payout', amount: 405, booking_id: 'b1', description: 'Paid to your bank account' });
      expect(byId['tx-t2']).toMatchObject({ type: 'fee', amount: -45, description: 'Vendly commission' });
      expect(byId['tx-t3']).toMatchObject({ type: 'refund', amount: -20, booking_title: 'Bridal Glam' });
      expect(byId['tx-t4']).toMatchObject({ type: 'refund', amount: -18 });
      expect(byId['tx-t5']).toMatchObject({ type: 'fee', amount: 2, description: 'Vendly commission returned with a refund' });
      expect(byId['tx-t6']).toMatchObject({ type: 'payout', amount: -100, booking_id: null, description: 'Withdrawal to your bank' });
      expect(byId['tx-t7']).toMatchObject({ booking_id: 'b-old', booking_title: 'Old Gig' });
    });

    it('filters to payouts, or commission, and searches by booking title', async () => {
      const payouts = await setup({ bookings, txs }).service.list(vendor, { type: 'payout' });
      expect(payouts.data.map((r) => r.id)).toEqual(['tx-t6', 'tx-t1', 'tx-t7']);
      const fees = await setup({ bookings, txs }).service.list(vendor, { type: 'fee' });
      expect(fees.data.map((r) => r.id).sort()).toEqual(['tx-t2', 'tx-t5']);
      const dj = await setup({ bookings, txs }).service.list(vendor, { q: 'DJ' });
      expect(dj.data.map((r) => r.id)).toEqual(['pay-p2']);
    });

    it('a vendor can read their own customer history too', async () => {
      const { service } = setup({ bookings: [] });
      expect((await service.list(vendor, { role: 'customer' })).meta.role).toBe('customer');
    });
  });
});
