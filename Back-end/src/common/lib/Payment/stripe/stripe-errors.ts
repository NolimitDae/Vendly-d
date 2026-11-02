/**
 * Stripe said the customer or account doesn't exist: deleted in Stripe, or saved while the server used
 * another Stripe account's keys. The stored id is then stale and should be replaced.
 */
export function isStripeMissing(err: unknown): boolean {
  const e = err as { code?: string; raw?: { code?: string } } | null;
  return e?.code === 'resource_missing' || e?.raw?.code === 'resource_missing';
}

/**
 * A saved payout (connected) account the server's Stripe keys can't use: gone ("No such account"), or
 * made under other keys, such as a test-mode account after the switch to live keys. Stripe answers
 * that with "does not have access to account" (code account_invalid). The stored id should be replaced.
 */
export function isStripeAccountGone(err: unknown): boolean {
  const e = err as { code?: string; raw?: { code?: string } } | null;
  return isStripeMissing(err) || e?.code === 'account_invalid' || e?.raw?.code === 'account_invalid';
}

/**
 * Stripe refused bank payments (ACH Direct Debit) because they aren't switched on for the account:
 * "The payment method type provided: us_bank_account is invalid. Please ensure the provided type is
 * activated in your dashboard".
 */
export function isBankPaymentsOff(err: unknown): boolean {
  const e = err as { message?: string; raw?: { message?: string } } | null;
  const msg = `${e?.raw?.message ?? ''} ${e?.message ?? ''}`;
  return /us_bank_account/i.test(msg) && /(invalid|activated|not enabled|not available|dashboard)/i.test(msg);
}
