/**
 * Stripe said the customer or account doesn't exist: deleted in Stripe, or saved while the server used
 * another Stripe account's keys. The stored id is then stale and should be replaced.
 */
export function isStripeMissing(err: unknown): boolean {
  const e = err as { code?: string; raw?: { code?: string } } | null;
  return e?.code === 'resource_missing' || e?.raw?.code === 'resource_missing';
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
