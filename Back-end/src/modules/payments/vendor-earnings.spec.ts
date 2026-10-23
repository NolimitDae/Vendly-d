import { BookingStatus, InstallmentStatus } from 'prisma/generated/enums';
import { bookingEarnings, EarningsBooking, EarningsInstallment, vendorEarnings } from './vendor-earnings';

const inst = (over: Partial<EarningsInstallment> = {}): EarningsInstallment => ({
  status: InstallmentStatus.PAID,
  amount: 110,
  fee_amount: 10,
  refunded_amount: 0,
  paid_out_at: null,
  ...over,
});

const booking = (over: Partial<EarningsBooking> = {}): EarningsBooking => ({
  id: 'b1',
  status: BookingStatus.CONFIRMED,
  amount: 200,
  paid_at: new Date(),
  released_at: null,
  payout_credited_at: null,
  commission_amount: null,
  released_gross: null,
  early_released_amount: 0,
  installments: [],
  ...over,
});

const now = new Date();

describe('vendor earnings maths', () => {
  it('holds the vendor part (fee excluded) of what was paid before release', () => {
    const r = bookingEarnings(booking({ installments: [inst(), inst({ status: InstallmentStatus.SCHEDULED })] }));
    expect(r).toEqual({ booking_id: 'b1', earned: 0, held: 100, commission: 0 });
  });

  it('counts a deposit released early as earned and holds the rest', () => {
    const r = bookingEarnings(booking({ early_released_amount: 100, installments: [inst(), inst()] }));
    expect(r).toMatchObject({ earned: 100, held: 100, commission: 0 });
  });

  it('takes the booking commission rate off what was paid out at release', () => {
    // 10% commission on a $200 vendor part
    const r = bookingEarnings(booking({
      status: BookingStatus.COMPLETED, released_at: now, payout_credited_at: now, commission_amount: 20, released_gross: 200,
      installments: [inst({ paid_out_at: now }), inst({ paid_out_at: now })],
    }));
    expect(r).toMatchObject({ earned: 180, held: 0, commission: 20 });
  });

  it('earns everything with the default 0% commission', () => {
    const r = bookingEarnings(booking({
      status: BookingStatus.COMPLETED, released_at: now, commission_amount: 0, released_gross: 200,
      installments: [inst({ paid_out_at: now }), inst({ paid_out_at: now })],
    }));
    expect(r).toMatchObject({ earned: 200, held: 0, commission: 0 });
  });

  it('nets out money given back after the payout, commission included', () => {
    // $50 of a paid-out installment was refunded: the vendor and Vendly each give back their share
    const r = bookingEarnings(booking({
      status: BookingStatus.COMPLETED, released_at: now, commission_amount: 20, released_gross: 200,
      installments: [inst({ paid_out_at: now, refunded_amount: 50 }), inst({ paid_out_at: now })],
    }));
    expect(r).toMatchObject({ earned: 135, commission: 15 });
  });

  it('holds an extra paid after the payout until it is paid out', () => {
    const r = bookingEarnings(booking({
      status: BookingStatus.COMPLETED, released_at: now, commission_amount: 10, released_gross: 100,
      installments: [inst({ paid_out_at: now }), inst({ amount: 30, fee_amount: 0 })],
    }));
    expect(r).toMatchObject({ earned: 90, held: 30, commission: 10 });
  });

  it('a cancelled booking keeps what is left after refunds, with no commission', () => {
    const r = bookingEarnings(booking({
      status: BookingStatus.CANCELLED, payout_credited_at: now,
      installments: [inst({ refunded_amount: 60 }), inst({ status: InstallmentStatus.REFUNDED, refunded_amount: 110 })],
    }));
    expect(r).toEqual({ booking_id: 'b1', earned: 40, held: 0, commission: 0 });
  });

  it('a fully refunded dispute earns nothing', () => {
    const r = bookingEarnings(booking({
      status: BookingStatus.COMPLETED, released_at: now, early_released_amount: 100,
      installments: [inst({ status: InstallmentStatus.REFUNDED, refunded_amount: 110 })],
    }));
    expect(r).toMatchObject({ earned: 0, held: 0, commission: 0 });
  });

  it('uses the booking amount for bookings without installments', () => {
    expect(bookingEarnings(booking({ status: BookingStatus.COMPLETED, released_at: now, released_gross: 200, commission_amount: 5 }))).toMatchObject({ earned: 195, commission: 5, held: 0 });
    expect(bookingEarnings(booking({ status: BookingStatus.COMPLETED, payout_credited_at: now }))).toMatchObject({ earned: 200, held: 0 });
    expect(bookingEarnings(booking({}))).toMatchObject({ earned: 0, held: 200 });
    expect(bookingEarnings(booking({ paid_at: null }))).toMatchObject({ earned: 0, held: 0 });
    expect(bookingEarnings(booking({ status: BookingStatus.CANCELLED }))).toMatchObject({ earned: 0, held: 0 });
  });

  it('adds up across bookings with the money given back', () => {
    const out = vendorEarnings([
      booking({ id: 'a', installments: [inst()] }),
      booking({ id: 'b', status: BookingStatus.COMPLETED, released_at: now, commission_amount: 20, released_gross: 200, installments: [inst({ paid_out_at: now }), inst({ paid_out_at: now })] }),
    ], 25.5);
    expect(out).toMatchObject({ earned: 180, held: 100, commission: 20, given_back: 25.5 });
    expect(out.bookings.map((b) => b.booking_id)).toEqual(['a', 'b']);
  });
});

describe('PaymentsService.vendorEarningsSummary', () => {
  // imported here so the maths tests above stay free of Nest/Stripe setup
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PaymentsService } = require('./payments.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __setFeeCache } = require('src/modules/platform/platform-settings.service');

  afterEach(() => __setFeeCache(null));

  it("reads only the vendor's bookings and give-backs and adds the balance and current rate", async () => {
    __setFeeCache({ percent: 10, minimum: 0, commission: 7.5, categories: new Map() });
    const prisma = {
      booking: { findMany: jest.fn().mockResolvedValue([booking({ installments: [inst()] })]) },
      paymentTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 12 } }) },
      user: { findUnique: jest.fn().mockResolvedValue({ balance: -5 }) },
    };
    const service = new PaymentsService(prisma as any, {} as any, {} as any);
    const res = await service.vendorEarningsSummary('v1');

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendor_id: 'v1' } }));
    expect(prisma.paymentTransaction.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 'v1', type: 'vendor_give_back', status: 'succeeded' } }));
    expect(res).toEqual({
      success: true,
      data: expect.objectContaining({ earned: 0, held: 100, commission: 0, given_back: 12, balance: 0, commission_percent: 7.5 }),
    });
  });
});
