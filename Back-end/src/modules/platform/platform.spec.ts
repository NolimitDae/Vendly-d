import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService, __setFeeCache, currentFees, platformServiceFee } from './platform-settings.service';
import { PromoService, promoDiscount } from './promo.service';

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

  it('needs exactly one of percent or amount off', async () => {
    const s = new PromoService({ promoCode: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } } as any);
    await expect(s.create({ code: 'BOTH', percent_off: 10, amount_off: 5 })).rejects.toThrow(BadRequestException);
    await expect(s.create({ code: 'NONE' })).rejects.toThrow(BadRequestException);
  });
});
