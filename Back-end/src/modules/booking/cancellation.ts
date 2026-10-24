/**
 * Money rules for cancelling a paid booking (App Development Brief, "Vendor cancels" / "Customer cancels").
 *
 * - Vendor cancels: the customer gets everything back, Vendly Protection fee included.
 * - Customer cancels: the vendor price is refunded per the cancellation policy in the booking's signed
 *   contract; the fee is not refunded; the vendor keeps the part of their price that isn't refunded.
 * - Deposit plans (bookings made from Oct 2026, `deposit_rules`): when the customer cancels, or the
 *   booking is cancelled because a deposit or balance wasn't paid in time (by Vendly, or by the vendor
 *   with "Customer didn't pay"), the vendor keeps the paid deposit; anything paid beyond it is refunded
 *   per the policy tiers (depositPlanVendorOwed). The fee rules are the customer cancellation ones.
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

export interface PaidInstallment {
  status: string;
  amount: unknown;
  fee_amount: unknown;
  refunded_amount: unknown;
}

/**
 * The settlement above assumes the whole price was paid. On a payment plan the customer may have
 * paid only a deposit, so settle against what was actually paid:
 * - Vendor cancels: everything paid comes back (Vendly Protection fee included).
 * - Customer cancels: the vendor keeps what they're owed under the policy, but never more than the
 *   customer actually paid towards the vendor's price; the rest of that is refunded. The fee stays paid.
 * Anything not yet charged is simply never charged.
 */
export function settleAgainstPaid(
  owed: Settlement,
  installments: PaidInstallment[],
  cancelledBy: 'CUSTOMER' | 'VENDOR',
  vendorOwed: number,
): Settlement {
  const paid = installments.filter((i) => i.status === 'PAID');
  const left = (i: PaidInstallment) => cents(Math.max(0, Number(i.amount) - Number(i.refunded_amount)));
  const vendorPart = (i: PaidInstallment) => cents(Math.max(0, Number(i.amount) - Number(i.fee_amount) - Number(i.refunded_amount)));
  const paidTotal = cents(paid.reduce((s, i) => s + left(i), 0));
  const vendorPaid = cents(paid.reduce((s, i) => s + vendorPart(i), 0));

  if (cancelledBy === 'VENDOR') {
    return { refundTotal: paidTotal, refundVendorPrice: vendorPaid, refundFee: cents(paidTotal - vendorPaid), vendorKeeps: 0, percent: 100 };
  }
  const vendorKeeps = cents(Math.min(vendorPaid, Math.max(0, vendorOwed)));
  const refund = cents(vendorPaid - vendorKeeps);
  return { refundTotal: refund, refundVendorPrice: refund, refundFee: 0, vendorKeeps, percent: owed.percent };
}

/**
 * Deposit plans: what the vendor is owed when the customer cancels or didn't pay. The paid deposit is
 * non-refundable; of what was paid beyond it (fees agreed after booking aside, those are the vendor's
 * in full) the vendor keeps the part the policy doesn't refund. Never more than was paid towards the
 * vendor's price. `percent` is the policy's refund percent at the time of cancelling.
 */
export function depositPlanVendorOwed(input: { vendorPaid: number; depositPaid: number; feesAgreed: number; percent: number }): { owed: number; depositKept: number } {
  const vendorPaid = cents(Math.max(0, input.vendorPaid));
  const depositKept = cents(Math.min(vendorPaid, Math.max(0, input.depositPaid)));
  const fees = cents(Math.max(0, input.feesAgreed));
  const rest = cents(Math.max(0, vendorPaid - depositKept - fees));
  const keptOfRest = cents((rest * (100 - input.percent)) / 100);
  return { owed: cents(Math.min(vendorPaid, depositKept + keptOfRest + fees)), depositKept };
}

/** What cancelling does with the money, as the apps show it before and after (see BookingService.cancellationTerms). */
export interface CancellationSummary {
  cancelled_by: 'CUSTOMER' | 'VENDOR';
  /** back to the customer's card */
  refund_total: number;
  /** part of the refund that is the Vendly Protection fee (vendor cancellations) */
  refund_fee: number;
  /** Vendly Protection fee the customer paid and doesn't get back (customer cancellations) */
  fee_kept: number;
  /** what the vendor keeps of what was paid */
  vendor_keeps: number;
  /** deposit plans: the paid deposit, part of vendor_keeps, that isn't refunded */
  deposit_kept?: number;
  policy: { key: string; label: string; text: string } | null;
  /** percent of the vendor price the policy refunds */
  percent: number;
  /** scheduled or failed charges that will never be taken */
  unpaid_cancelled: number;
  /** card holds (pay after service, rental deposits) let go */
  holds_released: number;
  /** "Visa •••• 4242", when known (customers only) */
  card: string | null;
  /** part of the refund Stripe didn't take when the booking was cancelled; Vendly follows it up */
  refund_failed?: number;
  /** refunds show on the card within this window */
  refund_timing: string | null;
  message: string;
  /** cancel preview only: the start passed and the vendor never started, so Report a problem fits better */
  report_problem_hint?: string;
}

export const REFUND_TIMING = '5–10 business days';

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * The plain sentence shown with a cancellation, worded for who reads it: "You'll get $225.00 back to
 * your card. The $22.50 Vendly Protection fee isn't refunded." `done` words it for after the fact.
 */
export function cancellationMessage(
  s: Omit<CancellationSummary, 'message' | 'refund_timing'> & { paid: boolean },
  viewer: 'CUSTOMER' | 'VENDOR',
  done = false,
): string {
  const out: string[] = [];
  // refund_total is what is on its way; a part Stripe didn't take is followed up by Vendly
  const failed = s.refund_failed ?? 0;
  const policy = s.policy ? `${s.policy.label.toLowerCase()} ` : '';
  const feeIncluded = s.cancelled_by === 'VENDOR' && s.refund_fee > 0 ? ', Vendly Protection fee included' : '';
  // deposit plans: the non-refundable deposit, and what the policy keeps on top of it
  const deposit = s.cancelled_by === 'CUSTOMER' ? Math.min(s.deposit_kept ?? 0, s.vendor_keeps) : 0;
  const beyond = cents(s.vendor_keeps - deposit);
  if (viewer === 'CUSTOMER') {
    if (s.refund_total > 0) {
      const to = `to your card${s.card ? ` (${s.card})` : ''}`;
      out.push(done ? `${usd(s.refund_total)} is being refunded ${to}${feeIncluded}.` : `You'll get ${usd(s.refund_total)} back ${to}${feeIncluded}.`);
    } else if (failed > 0) {
      // nothing went through: the next sentence says what happens
    } else if (s.paid) out.push(done ? 'Nothing was refunded.' : "You won't get a refund.");
    else out.push(done ? "You weren't charged, so there's nothing to refund." : "You haven't been charged, so there's nothing to refund.");
    if (failed > 0) out.push(`We couldn't refund ${usd(failed)} to your card straight away. Vendly will follow up with you about it.`);
    if (s.cancelled_by === 'CUSTOMER' && s.fee_kept > 0) out.push(`The ${usd(s.fee_kept)} Vendly Protection fee isn't refunded.`);
    if (deposit > 0) {
      out.push(`Your deposit of ${usd(deposit)} is non-refundable.`);
      if (beyond > 0) out.push(`The vendor keeps another ${usd(beyond)} under their ${policy}cancellation policy.`);
    } else if (s.vendor_keeps > 0) out.push(`The vendor keeps ${usd(s.vendor_keeps)} under their ${policy}cancellation policy.`);
    if (s.unpaid_cancelled > 0) out.push(`The ${usd(s.unpaid_cancelled)} still to pay won't be charged.`);
    if (s.holds_released > 0) out.push(`The ${usd(s.holds_released)} hold on your card ${done ? 'is' : 'will be'} released.`);
    if (s.refund_total > 0) out.push(`Refunds take ${REFUND_TIMING} to show.`);
  } else {
    if (s.refund_total > 0) out.push(`The customer ${done ? 'is getting' : 'gets'} ${usd(s.refund_total)} back${feeIncluded}.`);
    else if (failed > 0) {
      // nothing went through: the next sentence says what happens
    } else if (s.paid) out.push('Nothing is refunded to the customer.');
    else out.push(`The customer ${done ? "wasn't" : "hasn't been"} charged, so nothing is refunded.`);
    if (failed > 0) out.push(`A refund of ${usd(failed)} to the customer didn't go through straight away; Vendly is following it up.`);
    if (deposit > 0) out.push(`You keep the ${usd(deposit)} deposit${beyond > 0 ? `, plus ${usd(beyond)}${policy ? ` under your ${policy}cancellation policy` : ''}` : ''}.`);
    else if (s.vendor_keeps > 0) out.push(`You keep ${usd(s.vendor_keeps)}${policy ? ` under your ${policy}cancellation policy` : ''}.`);
    else if (s.paid) out.push('You keep nothing from this booking.');
    if (s.unpaid_cancelled > 0) out.push(`The ${usd(s.unpaid_cancelled)} still due won't be charged.`);
    if (s.holds_released > 0) out.push(`The ${usd(s.holds_released)} card hold ${done ? 'is' : 'will be'} released.`);
  }
  return out.join(' ');
}
