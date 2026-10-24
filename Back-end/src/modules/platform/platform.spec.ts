import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService, __setFeeCache, currentFees, platformServiceFee } from './platform-settings.service';
import { BookingStatus } from 'prisma/generated/client';
import { PROMO_ALREADY_USED, PROMO_FIRST_BOOKING_ONLY, PromoService, earlierBookingWhere, promoDiscount, promoUsedWhere } from './promo.service';

jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ fees: { customer_service_fee_percent: 5, customer_service_fee_minimum: 3 } }) }));

describe('platform fees', () => {
  afterEach(() => __setFeeCache(null));

  it('falls back to the environment when nothing is loaded', () => {
    expect(currentFees()).toMatchObject({ percent: 5, minimum: 3, commission: 0 });
    expect(platformServiceFee(100)).toBe(5);
    expect(platformServiceFee(20)).toBe(3); // minimum
  });

  it('uses a category override before the platform percent', () => {
    __setFeeCache({ percent: 8, minimum: 2, commission: 0, categories: new Map([['photo', 4]]) });
    expect(platformServiceFee(1000)).toBe(80);
    expect(platformServiceFee(1000, 'photo')).toBe(40);
    expect(platformServiceFee(10, 'photo')).toBe(2);
  });

  it('loads database values and rejects bad input', async () => {
    const prisma: any = {
      platformSetting: { findMany: jest.fn().mockResolvedValue([{ key: 'customer_service_fee_percent', value: '7' }, { key: 'vendor_commission_percent', value: '10' }]), upsert: jest.fn() },
      serviceCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', fee_percent: 3 }]) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const svc = new PlatformSettingsService(prisma);
    await svc.refresh();
    expect(currentFees()).toMatchObject({ percent: 7, minimum: 3, commission: 10 });
    expect(currentFees().categories.get('c1')).toBe(3);
    await expect(svc.update({ customer_service_fee_percent: '75' })).rejects.toThrow(BadRequestException);
    await expect(svc.update({ not_a_setting: '1' })).rejects.toThrow(BadRequestException);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('promo codes', () => {
  it('works out percent and fixed discounts, never more than the price', () => {
    expect(promoDiscount({ percent_off: 10 }, 450)).toBe(45);
    expect(promoDiscount({ amount_off: 20 }, 450)).toBe(20);
    expect(promoDiscount({ amount_off: 500 }, 450)).toBe(450);
  });

  const svc = (promo: any) => new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(promo) } } as any);

  it('quotes a valid code (case-insensitive)', async () => {
    await expect(svc({ code: 'GLAM20', active: true, amount_off: 20, uses: 0, max_uses: null, expires_at: null, min_amount: null }).quote('glam20', 200)).resolves.toEqual({ code: 'GLAM20', discount: 20 });
  });

  it.each([
    ['inactive', { active: false }],
    ['expired', { active: true, expires_at: new Date('2020-01-01') }],
    ['used up', { active: true, max_uses: 5, uses: 5 }],
    ['under the minimum', { active: true, min_amount: 500 }],
  ])('rejects a code that is %s', async (_label, over) => {
    await expect(svc({ code: 'X', amount_off: 10, uses: 0, max_uses: null, expires_at: null, min_amount: null, ...over }).quote('X', 100)).rejects.toThrow(BadRequestException);
  });

  it('refuses a redemption when someone else took the last use', async () => {
    const tx: any = { promoCode: { findUnique: jest.fn().mockResolvedValue({ id: 'p', active: true, uses: 4, max_uses: 5 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new PromoService({} as any).redeem(tx, 'x')).rejects.toThrow('used up');
    expect(tx.promoCode.updateMany).toHaveBeenCalledWith({ where: { id: 'p', uses: 4 }, data: { uses: { increment: 1 } } });
  });

  describe('per-customer limits', () => {
    const base = { code: 'FIRST20', active: true, amount_off: 20, uses: 0, max_uses: null, expires_at: null, min_amount: null };
    // a booking table that answers findFirst from the rows matching a few where shapes we use
    const withBookings = (promo: any, found: { used?: boolean; earlier?: boolean }) => {
      const findFirst = jest.fn(({ where }: any) => Promise.resolve((where.promo_code ? found.used : found.earlier) ? { id: 'b0' } : null));
      return { svc: new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(promo) }, booking: { findFirst } } as any), findFirst };
    };

    it('refuses a once-per-customer code the customer already used', async () => {
      const { svc } = withBookings({ ...base, once_per_customer: true }, { used: true });
      await expect(svc.quote('first20', 200, 'cust')).rejects.toThrow(PROMO_ALREADY_USED);
    });

    it('allows a once-per-customer code that has not been used', async () => {
      const { svc, findFirst } = withBookings({ ...base, once_per_customer: true }, {});
      await expect(svc.quote('first20', 200, 'cust')).resolves.toEqual({ code: 'FIRST20', discount: 20 });
      expect(findFirst).toHaveBeenCalledWith({ where: promoUsedWhere('cust', 'FIRST20'), select: { id: true } });
    });

    it('refuses a first-booking code once the customer has a booking that went ahead', async () => {
      const { svc } = withBookings({ ...base, first_booking_only: true }, { earlier: true });
      await expect(svc.quote('FIRST20', 200, 'cust')).rejects.toThrow(PROMO_FIRST_BOOKING_ONLY);
    });

    it('does not look at bookings for codes without limits, or without a customer', async () => {
      const a = withBookings(base, { used: true, earlier: true });
      await expect(a.svc.quote('FIRST20', 200, 'cust')).resolves.toBeTruthy();
      const b = withBookings({ ...base, once_per_customer: true, first_booking_only: true }, { used: true, earlier: true });
      await expect(b.svc.quote('FIRST20', 200)).resolves.toBeTruthy();
      expect(a.findFirst).not.toHaveBeenCalled();
      expect(b.findFirst).not.toHaveBeenCalled();
    });

    it('counts pending and paid uses, but not declined, expired or unpaid cancelled requests', () => {
      const w = promoUsedWhere('cust', 'FIRST20');
      expect(w).toMatchObject({ customer_id: 'cust', promo_code: 'FIRST20' });
      expect(w.NOT).toEqual([{ status: BookingStatus.REJECTED }, { status: BookingStatus.CANCELLED, paid_at: null }]);
    });

    it('counts confirmed, started, completed or paid bookings as earlier bookings', () => {
      expect(earlierBookingWhere('cust').OR).toEqual([
        { status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] } },
        { paid_at: { not: null } },
      ]);
      expect(earlierBookingWhere('cust', 'new').id).toEqual({ not: 'new' });
    });

    it('checks again at redemption, leaving out the booking just created', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'other' });
      const tx: any = {
        promoCode: { findUnique: jest.fn().mockResolvedValue({ ...base, id: 'p', once_per_customer: true }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        booking: { findFirst },
      };
      await expect(new PromoService({} as any).redeem(tx, 'FIRST20', { customerId: 'cust', bookingId: 'new' })).rejects.toThrow(PROMO_ALREADY_USED);
      expect(findFirst).toHaveBeenCalledWith({ where: promoUsedWhere('cust', 'FIRST20', 'new'), select: { id: true } });
    });

    it('saves the two limits from the admin form', async () => {
      const create = jest.fn(({ data }: any) => Promise.resolve(data));
      const s = new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(null), create } } as any);
      await s.create({ code: 'FIRST20', amount_off: 20, once_per_customer: true, first_booking_only: true });
      expect(create.mock.calls[0][0].data).toMatchObject({ once_per_customer: true, first_booking_only: true });
      await s.create({ code: 'PLAIN', amount_off: 5 });
      expect(create.mock.calls[1][0].data).toMatchObject({ once_per_customer: false, first_booking_only: false });
    });
  });

  it('needs exactly one of percent or amount off', async () => {
    const s = new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    await expect(s.create({ code: 'BOTH', percent_off: 10, amount_off: 5 })).rejects.toThrow(BadRequestException);
    await expect(s.create({ code: 'NONE' })).rejects.toThrow(BadRequestException);
  });
});
