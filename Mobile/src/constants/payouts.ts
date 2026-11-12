/**
 * How vendors get paid (same wording as the website, Front-End/lib/payouts.ts). Stripe charges Vendly 1%
 * for each instant payout and Vendly passes exactly that on (Stripe Dashboard > Connect > Instant Payouts
 * pricing); Stripe's Payouts screen shows the exact fee before the vendor confirms.
 */
export const INSTANT_PAYOUT_FEE = '1%';
export const STANDARD_PAYOUT_TEXT = 'Booking payouts go to your Stripe account when Vendly releases them, and Stripe sends them to your bank on its daily schedule, usually in 1–2 business days, free.';
export const INSTANT_PAYOUT_TEXT = `Need it sooner? Cash out instantly to an eligible debit card or bank account, usually within 30 minutes, any day. Stripe's fee for an instant payout is ${INSTANT_PAYOUT_FEE} of the amount, taken from the payout and shown before you confirm.`;
