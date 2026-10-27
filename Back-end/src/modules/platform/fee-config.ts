import appConfig from 'src/config/app.config';

/**
 * The fee and payment settings that money maths reads synchronously (contract previews, booking
 * creation, charge timing). Admin → Settings stores them; PlatformSettingsService loads them here.
 * Kept apart from the service so contract text (contract-merge.ts) can read them without an import cycle.
 */
export interface FeeConfig {
  percent: number;
  minimum: number;
  /** the most a booking's Vendly Protection fee can be; 0 or missing = no cap */
  maximum?: number;
  commission: number;
  categories: Map<string, number>;
  /** bookings whose total (price + fee) is at least this are "large"; 0 = none are; missing = the default */
  largeThreshold?: number;
}

/** Owner's defaults (Nov 2026): the fee is capped at $500, bookings of $5,000 or more are large. */
export const DEFAULT_FEE_MAXIMUM = 500;
export const DEFAULT_LARGE_PAYMENT_THRESHOLD = 5000;

export const envFees = (): FeeConfig => {
  const f = appConfig().fees ?? ({} as any);
  return {
    percent: Number(f.customer_service_fee_percent ?? 5),
    minimum: Number(f.customer_service_fee_minimum ?? 3),
    maximum: DEFAULT_FEE_MAXIMUM,
    commission: 0,
    categories: new Map(),
    largeThreshold: DEFAULT_LARGE_PAYMENT_THRESHOLD,
  };
};

// Module-level cache so fee maths stays synchronous in hot paths (contract previews, booking creation).
let cache: FeeConfig | null = null;

/** Current fee settings: database values when loaded, else the environment defaults. */
export function currentFees(): FeeConfig {
  return cache ?? envFees();
}

/** For tests: set or clear the cached fee config. */
export function __setFeeCache(c: FeeConfig | null) {
  cache = c;
}

/**
 * Vendly Protection fee for a vendor price, rounded to cents: `percent` of the price, but never less
 * than `minimum` (brief: 5%, $3 minimum, so small bookings still cover card processing) and never more
 * than `maximum` when there is one (owner, Nov 2026: up to $500). Free bookings carry no fee.
 */
export function serviceFeeFor(price: unknown, percent: number, minimum = 0, maximum = 0) {
  const p = Number(price ?? 0);
  if (!(p > 0)) return 0;
  const fee = Math.max(Math.round(p * percent) / 100, minimum);
  return maximum > 0 ? Math.min(fee, maximum) : fee;
}

/** The fee cap in force (0 = none). */
export const feeMaximum = () => Math.max(0, Number(currentFees().maximum ?? 0) || 0);

/** Vendly Protection fee for a price, honouring a category override and the cap. */
export function platformServiceFee(price: unknown, categoryId?: string | null): number {
  const f = currentFees();
  const percent = (categoryId && f.categories.get(categoryId)) ?? f.percent;
  return serviceFeeFor(price, percent, f.minimum, feeMaximum());
}

/** The large payment threshold in force (0 = no booking is large). */
export function largePaymentThreshold(): number {
  const t = currentFees().largeThreshold;
  return t == null ? DEFAULT_LARGE_PAYMENT_THRESHOLD : Math.max(0, Number(t) || 0);
}

/** A booking total (price + Vendly Protection fee) at or above the threshold: 48 hours to fix a failed payment, bank payments allowed. */
export function isLargeTotal(total: unknown): boolean {
  const t = largePaymentThreshold();
  const n = Math.round(Number(total ?? 0) * 100) / 100;
  return t > 0 && n >= t;
}

/** Whether a booking is large, from its stored price and fee. */
export const isLargeBooking = (b: { amount?: unknown; service_fee?: unknown }) => isLargeTotal(Number(b.amount ?? 0) + Number(b.service_fee ?? 0));

/** "$5,000" for contract text and messages (no cents when whole). */
export function thresholdText(amount = largePaymentThreshold()) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
