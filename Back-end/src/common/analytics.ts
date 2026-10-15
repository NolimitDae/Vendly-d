/**
 * Product analytics, sent from the server so ad blockers can't drop them and web + app don't
 * double count. Uses PostHog's capture API directly (no SDK). Does nothing until POSTHOG_KEY is set,
 * and never throws or slows the request it's called from.
 *
 * Events: signup, booking_requested, booking_accepted, payment_succeeded, payment_failed,
 * payout_released, dispute_opened, dispute_resolved, quote_sent, rental_requested.
 */
export function track(event: string, distinctId: string | null | undefined, properties: Record<string, unknown> = {}) {
  const key = process.env.POSTHOG_KEY;
  if (!key || !distinctId || process.env.NODE_ENV === 'test') return;
  const host = (process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/+$/, '');
  void fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, timestamp: new Date().toISOString(), properties: { ...properties, $lib: 'vendly-api' } }),
  }).catch(() => {});
}
