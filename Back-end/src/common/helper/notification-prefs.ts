/**
 * Which optional pushes and emails a user wants, stored on `User.notification_prefs`.
 * Null, or a key that isn't there, means on.
 *
 * Only optional messages are covered. These are always sent, whatever the user picked:
 * security (sign-in and email codes, password reset, 2FA, ID checks), receipts, invoices,
 * refunds and failed-payment emails, disputes and fee reviews, and contract signing.
 * Callers send those without a topic. The `payments` toggle covers payment pushes only,
 * never the receipt or refund email.
 */
export const NOTIFICATION_PREF_KEYS = ['booking_updates', 'messages', 'payments', 'reminders', 'review_requests', 'email'] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;
/** What an optional message is about; `email` is the channel switch, not a topic. */
export type NotificationTopic = Exclude<NotificationPrefKey, 'email'>;
export type NotificationChannel = 'push' | 'email';

/** The stored JSON as a full set of switches: anything not explicitly false is on. */
export function readPrefs(raw: unknown): NotificationPrefs {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, stored[k] !== false])) as NotificationPrefs;
}

/**
 * Whether to send a message about `topic` on `channel`. No topic means a required message: always sent.
 * Optional emails also need the email switch on. Payment emails are never optional.
 */
export function wants(raw: unknown, topic: NotificationTopic | undefined, channel: NotificationChannel): boolean {
  if (!topic) return true;
  if (topic === 'payments' && channel === 'email') return true;
  const prefs = readPrefs(raw);
  if (!prefs[topic]) return false;
  return channel === 'email' ? prefs.email : true;
}
