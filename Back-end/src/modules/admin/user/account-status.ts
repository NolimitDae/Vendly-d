import { PrismaService } from 'src/prisma/prisma.service';

/** Inbox types for an admin suspending or restoring an account; they double as the account's status history. */
export const ACCOUNT_SUSPENDED = 'account_suspended';
export const ACCOUNT_RESTORED = 'account_restored';
export const ACCOUNT_STATUS_TYPES = [ACCOUNT_SUSPENDED, ACCOUNT_RESTORED];

const TITLES = { 0: 'Your account was suspended', 1: 'Your account is active again' } as const;
// the body when the admin gave no reason
const NO_REASON = { 0: 'Contact Vendly support to find out more.', 1: 'You can sign in as usual.' } as const;

/** "Title: body", as the inbox shows it (the app splits on the first ": "). */
export function accountStatusText(status: 0 | 1, reason?: string | null) {
  return `${TITLES[status]}: ${reason?.trim() || NO_REASON[status]}`;
}

/** The admin's reason back out of a stored note, or null when none was given. */
export function accountStatusReason(text: string | null | undefined): string | null {
  const body = (text ?? '').split(': ').slice(1).join(': ').trim();
  return body && body !== NO_REASON[0] && body !== NO_REASON[1] ? body : null;
}

/**
 * Keeps a note in the user's inbox when an admin suspends or restores them, with the reason given.
 * They read it once they can sign in again, and admins see these notes as the account's history.
 */
export async function recordAccountStatus(
  prisma: PrismaService,
  opts: { userId: string; adminId: string; status: 0 | 1; reason?: string | null },
) {
  const event = await prisma.notificationEvent.create({
    data: {
      type: opts.status === 0 ? ACCOUNT_SUSPENDED : ACCOUNT_RESTORED,
      text: accountStatusText(opts.status, opts.reason).slice(0, 1000),
    },
  });
  await prisma.notification.create({
    data: { receiver_id: opts.userId, sender_id: opts.adminId, notification_event_id: event.id },
  });
}
