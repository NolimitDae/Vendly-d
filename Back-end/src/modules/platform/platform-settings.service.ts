import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { __setFeeCache, currentFees, DEFAULT_FEE_MAXIMUM, DEFAULT_LARGE_PAYMENT_THRESHOLD, envFees, feeMaximum, largePaymentThreshold, type FeeConfig } from './fee-config';
import { LARGE_PAYMENT_DUE_HOURS, PAYMENT_DUE_HOURS } from 'src/modules/payments/payment-due';

// the fee maths lives in fee-config.ts (contract text reads it too); these names stay importable from here
export { __setFeeCache, currentFees, isLargeBooking, isLargeTotal, largePaymentThreshold, platformServiceFee, type FeeConfig } from './fee-config';

/** Settings an admin may change, with how each is validated. Unknown keys are rejected. */
const SCHEMA: Record<string, { kind: 'percent' | 'money' | 'text'; label: string }> = {
  customer_service_fee_percent: { kind: 'percent', label: 'Vendly Protection fee (%)' },
  customer_service_fee_minimum: { kind: 'money', label: 'Minimum Vendly Protection fee ($)' },
  customer_service_fee_maximum: { kind: 'money', label: 'Maximum Vendly Protection fee ($, empty for no cap)' },
  vendor_commission_percent: { kind: 'percent', label: 'Vendor commission (%)' },
  large_payment_threshold: { kind: 'money', label: 'Large booking from ($, 0 turns it off)' },
  currency: { kind: 'text', label: 'Currency' },
  min_booking_amount: { kind: 'money', label: 'Minimum booking amount ($)' },
  max_booking_amount: { kind: 'money', label: 'Maximum booking amount ($)' },
  timezone: { kind: 'text', label: 'Timezone' },
};

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((e) => this.logger.warn(`Using env fee defaults: ${e?.message ?? e}`));
  }

  /** Reloads the fee cache from the database. */
  async refresh() {
    const [rows, cats] = await Promise.all([
      this.prisma.platformSetting.findMany(),
      this.prisma.serviceCategory.findMany({ where: { fee_percent: { not: null } }, select: { id: true, fee_percent: true } }),
    ]);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const env = envFees();
    const num = (k: string, d: number) => (map.has(k) && map.get(k) !== '' && !Number.isNaN(Number(map.get(k))) ? Number(map.get(k)) : d);
    const config: FeeConfig = {
      percent: num('customer_service_fee_percent', env.percent),
      minimum: num('customer_service_fee_minimum', env.minimum),
      // saved empty means no cap; never saved means the default cap
      maximum: map.has('customer_service_fee_maximum') ? Math.max(0, Number(map.get('customer_service_fee_maximum')) || 0) : DEFAULT_FEE_MAXIMUM,
      commission: num('vendor_commission_percent', 0),
      categories: new Map(cats.map((c) => [c.id, Number(c.fee_percent)])),
      largeThreshold: num('large_payment_threshold', DEFAULT_LARGE_PAYMENT_THRESHOLD),
    };
    __setFeeCache(config);
    return config;
  }

  async getAll() {
    const rows = await this.prisma.platformSetting.findMany();
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const fees = currentFees();
    const defaults: Record<string, string> = {
      customer_service_fee_percent: String(fees.percent),
      customer_service_fee_minimum: String(fees.minimum),
      customer_service_fee_maximum: fees.maximum ? String(fees.maximum) : '',
      vendor_commission_percent: String(fees.commission),
      large_payment_threshold: String(fees.largeThreshold ?? DEFAULT_LARGE_PAYMENT_THRESHOLD),
      currency: 'USD',
      min_booking_amount: '',
      max_booking_amount: '',
      timezone: 'UTC',
    };
    const categories = await this.prisma.serviceCategory.findMany({ select: { id: true, name: true, fee_percent: true, default_payment_plan: true }, orderBy: { name: 'asc' } });
    return {
      success: true,
      data: {
        settings: Object.keys(SCHEMA).map((key) => ({ key, label: SCHEMA[key].label, kind: SCHEMA[key].kind, value: values[key] ?? defaults[key] })),
        categories: categories.map((c) => ({ ...c, fee_percent: c.fee_percent == null ? null : Number(c.fee_percent) })),
      },
    };
  }

  async update(updates: Record<string, unknown>) {
    const entries = Object.entries(updates ?? {});
    for (const [key, value] of entries) {
      const def = SCHEMA[key];
      if (!def) throw new BadRequestException(`Unknown setting: ${key}`);
      const v = String(value ?? '').trim();
      if (def.kind !== 'text' && v !== '') {
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) throw new BadRequestException(`${def.label} must be a positive number`);
        if (def.kind === 'percent' && n > 50) throw new BadRequestException(`${def.label} can't be more than 50%`);
      }
    }
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({ where: { key }, create: { key, value: String(value ?? '').trim() }, update: { value: String(value ?? '').trim() } }),
      ),
    );
    await this.refresh();
    return this.getAll();
  }

  async setCategoryFee(categoryId: string, feePercent: number | null) {
    if (feePercent != null && (Number.isNaN(Number(feePercent)) || feePercent < 0 || feePercent > 50)) {
      throw new BadRequestException('Category fee must be between 0 and 50%');
    }
    await this.prisma.serviceCategory.update({ where: { id: categoryId }, data: { fee_percent: feePercent } });
    await this.refresh();
    return { success: true };
  }

  /** Public: what the apps need for fee and payment wording ("5%, up to $500", "48 hours on bookings of $5,000 or more"). */
  paymentSettings() {
    const f = currentFees();
    return {
      success: true,
      data: {
        fee_percent: f.percent,
        fee_minimum: f.minimum,
        fee_maximum: feeMaximum() || null,
        large_payment_threshold: largePaymentThreshold() || null,
        payment_due_hours: PAYMENT_DUE_HOURS,
        large_payment_due_hours: LARGE_PAYMENT_DUE_HOURS,
      },
    };
  }

  // ─── Feature flags ────────────────────────────────────────────────────────

  async listFlags() {
    return { success: true, data: await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) };
  }

  async setFlag(key: string, enabled: boolean, description?: string) {
    if (!/^[a-z0-9_.-]{2,100}$/.test(key)) throw new BadRequestException('Flag keys use lowercase letters, numbers, dots, dashes and underscores');
    const flag = await this.prisma.featureFlag.upsert({ where: { key }, create: { key, enabled, description }, update: { enabled, ...(description !== undefined ? { description } : {}) } });
    return { success: true, data: flag };
  }

  async deleteFlag(key: string) {
    await this.prisma.featureFlag.delete({ where: { key } }).catch(() => null);
    return { success: true };
  }

  /** Public: the keys of enabled flags, for apps to switch features on. */
  /** Enabled keys in data; switched-off keys in disabled (so apps can treat an unknown flag as on). */
  async enabledFlags() {
    const rows = await this.prisma.featureFlag.findMany({ select: { key: true, enabled: true } });
    return { success: true, data: rows.filter((r) => r.enabled).map((r) => r.key), disabled: rows.filter((r) => !r.enabled).map((r) => r.key) };
  }
}
