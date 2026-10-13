/**
 * Money rules for cancelling a paid booking (App Development Brief, "Vendor cancels" / "Customer cancels").
 *
 * - Vendor cancels: the customer gets everything back, Vendly Protection fee included.
 * - Customer cancels: the vendor price is refunded per the cancellation policy in the booking's signed
 *   contract; the fee is not refunded; the vendor keeps the part of their price that isn't refunded.
 *
 * Tiers mirror the policy text customers sign (contracts/contract-templates.ts CANCELLATION_PRESETS):
 *   flexible  100% at 7+ days before the event, 50% from 48 hours, none under 48 hours
 *   moderate  100% at 30+ days, 50% at 14-29 days, none under 14 days
 *   strict    50% at 60+ days, none under 60 days
 */

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Percentage of the vendor price refunded when the customer cancels. */
export function customerRefundPercent(
  policy: string | null | undefined,
  eventStart: Date | null | undefined,
  cancelledAt: Date,
): number {
  // Without an event date the time-based policy can't apply; give the customer the benefit of the doubt.
  if (!eventStart) return 100;
  const before = eventStart.getTime() - cancelledAt.getTime();
  switch (policy) {
    case 'flexible':
      return before >= 7 * DAY ? 100 : before >= 48 * HOUR ? 50 : 0;
    case 'strict':
      return before >= 60 * DAY ? 50 : 0;
    case 'moderate':
    default:
      // moderate is the contract default when a vendor hasn't picked one
      return before >= 30 * DAY ? 100 : before >= 14 * DAY ? 50 : 0;
  }
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface Settlement {
  /** Total to refund to the customer's card. */
  refundTotal: number;
  /** Part of the vendor price refunded. */
  refundVendorPrice: number;
  /** Part of the Vendly Protection fee refunded. */
  refundFee: number;
  /** Vendor price the vendor keeps (credited to their payout balance). */
  vendorKeeps: number;
  /** Percent of the vendor price refunded. */
  percent: number;
}

export function settleCancellation(input: {
  cancelledBy: 'CUSTOMER' | 'VENDOR';
  amount: number;
  serviceFee: number;
  policy?: string | null;
  eventStart?: Date | null;
  cancelledAt: Date;
}): Settlement {
  const amount = cents(Number(input.amount) || 0);
  const fee = cents(Number(input.serviceFee) || 0);

  if (input.cancelledBy === 'VENDOR') {
    return { refundTotal: cents(amount + fee), refundVendorPrice: amount, refundFee: fee, vendorKeeps: 0, percent: 100 };
  }

  const percent = customerRefundPercent(input.policy, input.eventStart, input.cancelledAt);
  const refundVendorPrice = cents((amount * percent) / 100);
  return {
    refundTotal: refundVendorPrice,
    refundVendorPrice,
    refundFee: 0,
    vendorKeeps: cents(amount - refundVendorPrice),
    percent,
  };
}
