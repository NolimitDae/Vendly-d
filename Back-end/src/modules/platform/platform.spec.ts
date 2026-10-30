import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService, __setFeeCache, currentFees, platformServiceFee } from './platform-settings.service';
import { BookingStatus } from 'prisma/generated/client';
import { PROMO_ALREADY_USED, PROMO_FIRST_BOOKING_ONLY, PROMO_NOT_THIS_PACKAGE, PROMO_NOT_THIS_VENDOR, PromoService, earlierBookingWhere, promoDiscount, promoUsedWhere } from './promo.service';

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

    it('counts every earlier booking or open request, but not declined, expired or unpaid cancelled ones', () => {
      expect(earlierBookingWhere('cust').NOT).toEqual([{ status: BookingStatus.REJECTED }, { status: BookingStatus.CANCELLED, paid_at: null }]);
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

describe('vendors\' own promo codes', () => {
  const code = { id: 'p1', code: 'GLAM10', active: true, uses: 0, max_uses: null, min_amount: null, expires_at: null, percent_off: 10, amount_off: null, vendor_id: 'v1', listing_ids: [] as string[] };
  const svc = (promo: any, extra: any = {}) => new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(promo), create: jest.fn(({ data }) => data), update: jest.fn(({ data }) => data) }, ...extra } as any);

  it('works only on that vendor\'s packages, and only the ones it names', async () => {
    await expect(svc(code).quote('glam10', 200, undefined, new Date(), { vendorId: 'v1', listingId: 'l1' })).resolves.toEqual({ code: 'GLAM10', discount: 20 });
    await expect(svc(code).quote('GLAM10', 200, undefined, new Date(), { vendorId: 'v2', listingId: 'l9' })).rejects.toThrow(PROMO_NOT_THIS_VENDOR);
    await expect(svc(code).quote('GLAM10', 200)).rejects.toThrow(PROMO_NOT_THIS_VENDOR);
    const narrow = { ...code, listing_ids: ['l1'] };
    await expect(svc(narrow).quote('GLAM10', 200, undefined, new Date(), { vendorId: 'v1', listingId: 'l2' })).rejects.toThrow(PROMO_NOT_THIS_PACKAGE);
    // Vendly's own codes still work on any package
    await expect(svc({ ...code, vendor_id: null }).quote('GLAM10', 200, undefined, new Date(), { vendorId: 'v2', listingId: 'l9' })).resolves.toMatchObject({ discount: 20 });
  });

  it('always leaves 10% of the price to charge', () => {
    expect(promoDiscount({ amount_off: 500, vendor_id: 'v1' }, 200)).toBe(180);
    expect(promoDiscount({ amount_off: 500 }, 200)).toBe(200);
  });

  it('is made for the vendor\'s own packages only, with at most 90% off', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const s = svc(null, { vendorListing: { count } });
    const res = await s.createForVendor('v1', { code: 'summer-15', percent_off: 15, listing_ids: ['l1'] });
    expect(res.data).toMatchObject({ code: 'SUMMER-15', vendor_id: 'v1', listing_ids: ['l1'] });
    expect(count).toHaveBeenCalledWith({ where: { id: { in: ['l1'] }, vendor_id: 'v1', deleted_at: null } });

    count.mockResolvedValue(0);
    await expect(s.createForVendor('v1', { code: 'OTHERS', percent_off: 10, listing_ids: ['not-mine'] })).rejects.toThrow('from your list');
    await expect(svc(null).createForVendor('v1', { code: 'FREE', percent_off: 100 })).rejects.toThrow('between 0 and 90');
  });

  it('won\'t take a code someone else already uses, or touch another vendor\'s code', async () => {
    await expect(svc({ id: 'x', code: 'TAKEN' }).createForVendor('v1', { code: 'taken', percent_off: 10 })).rejects.toThrow('already taken');
    await expect(svc({ ...code, vendor_id: 'v2' }).updateForVendor('v1', 'p1', { active: false })).rejects.toThrow('not found');
    await expect(svc({ ...code, vendor_id: null }).removeForVendor('v1', 'p1')).rejects.toThrow('not found');
  });
});
