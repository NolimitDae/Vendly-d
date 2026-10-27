import { InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { isLargeTotal, thresholdText } from 'src/modules/platform/fee-config';

/**
 * Bank payments (ACH Direct Debit) on large bookings (owner, Nov 2026). The booking is confirmed as
 * usual; each charge on the bank account shows "Processing" until it clears (about 4 business days),
 * the vendor is paid out only once it has cleared, and a payment that fails or is returned gives the
 * customer the usual window to pay another way (payment-due.ts).
 */
export const BANK = 'us_bank_account';

/** How long a bank payment usually takes to clear, for the apps and emails. */
export const BANK_CLEARING_TEXT = 'about 4 business days';

export const isBank = (type: string | null | undefined) => type === BANK;

/** An installment whose bank payment is on its way: not paid, not failed. */
export const isClearing = (i: { status: InstallmentStatus | string; clearing_since?: Date | string | null }) =>
  i.status === InstallmentStatus.PROCESSING && !!i.clearing_since;

/** "Bank account •••• 6789", as a card reads "Visa •••• 4242". */
export function bankText(bank: { bank_name?: string | null; last4?: string | null } | null | undefined) {
  if (!bank?.last4) return null;
  return `Bank account •••• ${bank.last4}`;
}

/**
 * Why a bank account can't pay for this booking, or null when it can: only large bookings, and never
 * for a card hold (pay after service holds the card until the job is done; rentals hold a security
 * deposit), which a bank account can't do.
 */
export function bankNotAllowedReason(b: { total: number; plan?: PaymentPlan | string | null; securityDeposit?: unknown }): string | null {
  if (!isLargeTotal(b.total)) return `Bank payments are for bookings of ${thresholdText()} or more. Please choose a card.`;
  if (b.plan === PaymentPlan.PAY_AFTER_SERVICE) return 'This booking holds a card until after the service, which a bank account can’t do. Please choose a card.';
  if (Number(b.securityDeposit ?? 0) > 0) return 'This booking has a security deposit hold, which needs a card. Please choose a card.';
  return null;
}

/** The kind of a saved payment method ("card", "us_bank_account"), or null when Stripe can't be asked. */
export async function paymentMethodType(paymentMethodId: string | null | undefined): Promise<string | null> {
  if (!paymentMethodId) return null;
  try {
    const pm = (await StripePayment.retrievePaymentMethod(paymentMethodId)) as { type?: string; us_bank_account?: unknown } | null;
    if (!pm) return null;
    return pm.type ?? (pm.us_bank_account ? BANK : 'card');
  } catch {
    return null;
  }
}
