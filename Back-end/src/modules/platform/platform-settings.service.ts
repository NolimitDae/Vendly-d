import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import appConfig from 'src/config/app.config';
import { serviceFeeFor } from 'src/modules/contracts/contract-merge';

/** Settings an admin may change, with how each is validated. Unknown keys are rejected. */
const SCHEMA: Record<string, { kind: 'percent' | 'money' | 'text'; label: string }> = {
  customer_service_fee_percent: { kind: 'percent', label: 'Vendly Protection fee (%)' },
  customer_service_fee_minimum: { kind: 'money', label: 'Minimum Vendly Protection fee ($)' },
  vendor_commission_percent: { kind: 'percent', label: 'Vendor commission (%)' },
  currency: { kind: 'text', label: 'Currency' },
  min_booking_amount: { kind: 'money', label: 'Minimum booking amount ($)' },
  max_booking_amount: { kind: 'money', label: 'Maximum booking amount ($)' },
  timezone: { kind: 'text', label: 'Timezone' },
};

export interface FeeConfig {
  percent: number;
  minimum: number;
  commission: number;
  categories: Map<string, number>;
}

const envFees = (): FeeConfig => {
  const f = appConfig().fees ?? ({} as any);
  return { percent: Number(f.customer_service_fee_percent ?? 5), minimum: Number(f.customer_service_fee_minimum ?? 3), commission: 0, categories: new Map() };
};

// Module-level cache so fee maths stays synchronous in hot paths (contract previews, booking creation).
let cache: FeeConfig | null = null;

/** Current fee settings: database values when loaded, else the environment defaults. */
export function currentFees(): FeeConfig {
  return cache ?? envFees();
}

/** Vendly Protection fee for a price, honouring a category override. */
export function platformServiceFee(price: unknown, categoryId?: string | null): number {
  const f = currentFees();
  const percent = (categoryId && f.categories.get(categoryId)) ?? f.percent;
  return serviceFeeFor(price, percent, f.minimum);
}

/** For tests: set or clear the cached fee config. */
export function __setFeeCache(c: FeeConfig | null) {
  cache = c;
}

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
    cache = {
      percent: num('customer_service_fee_percent', env.percent),
      minimum: num('customer_service_fee_minimum', env.minimum),
      commission: num('vendor_commission_percent', 0),
      categories: new Map(cats.map((c) => [c.id, Number(c.fee_percent)])),
    };
    return cache;
  }

  async getAll() {
    const rows = await this.prisma.platformSetting.findMany();
    const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const fees = currentFees();
    const defaults: Record<string, string> = {
      customer_service_fee_percent: String(fees.percent),
      customer_service_fee_minimum: String(fees.minimum),
      vendor_commission_percent: String(fees.commission),
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
  async enabledFlags() {
    const rows = await this.prisma.featureFlag.findMany({ where: { enabled: true }, select: { key: true } });
    return { success: true, data: rows.map((r) => r.key) };
  }
}
