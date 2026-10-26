/**
 * Stripe said the customer or account doesn't exist: deleted in Stripe, or saved while the server used
 * another Stripe account's keys. The stored id is then stale and should be replaced.
 */
export function isStripeMissing(err: unknown): boolean {
  const e = err as { code?: string; raw?: { code?: string } } | null;
  return e?.code === 'resource_missing' || e?.raw?.code === 'resource_missing';
}
