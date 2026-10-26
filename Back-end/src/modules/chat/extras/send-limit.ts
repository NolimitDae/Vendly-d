import { ForbiddenException } from '@nestjs/common';
import { UserType } from 'prisma/generated/client';
import { acceptedBookingWhere } from './inbox';

/**
 * Customer message limit (owner's rule, Oct 2026): in a 1:1 chat with a vendor, a customer (or a
 * planner booking as one) can send 3 messages until the vendor replies at least once in that chat
 * or accepts a booking with them. After that there is no limit.
 * Only messages the customer types count (text and photos); quotes, system notices, planner invites
 * and booking requests never count and are never stopped. Vendors, admins and chats with an admin
 * (support) are never limited, nor are event group chats.
 */
export const CUSTOMER_MESSAGE_LIMIT = 3;

/** Message kinds a person types themselves (photos are sent as "text" too). */
export const TYPED_KINDS = ['text'];

export type SendLimit = {
  limit: number;
  used: number;
  remaining: number;
  /** who the customer is waiting on, for "You can send more once {vendor} replies" */
  vendor_name: string;
};

type LimitReader = {
  user: {
    findMany: (args: any) => Promise<{ id: string; name: string | null; type: UserType | null; roles: UserType[] | null; vendorProfile?: { license_status: string | null } | null }[]>;
  };
  message: { count: (args: any) => Promise<number> };
  booking: { count: (args: any) => Promise<number> };
};

const has = (u: { type: UserType | null; roles: UserType[] | null }, t: UserType) => u.type === t || !!u.roles?.includes(t);

export const sendLimitMessage = (vendorName: string) =>
  `You can send ${CUSTOMER_MESSAGE_LIMIT} messages until ${vendorName} replies. They'll get back to you soon.`;

/**
 * The limit `senderId` is under in this conversation, or null when they aren't limited (any more).
 * `remaining` is how many typed messages they can still send.
 */
export async function sendLimitFor(
  prisma: LimitReader,
  conversation: { id: string; is_group?: boolean | null; vendor_replied_at?: Date | null; participants: { userId: string }[] },
  senderId: string,
): Promise<SendLimit | null> {
  if (conversation.is_group || conversation.vendor_replied_at) return null;
  const otherId = conversation.participants.find((p) => p.userId !== senderId)?.userId;
  if (!otherId) return null;

  const users = await prisma.user.findMany({
    where: { id: { in: [senderId, otherId] } },
    select: { id: true, name: true, type: true, roles: true, vendorProfile: { select: { license_status: true } } },
  });
  const sender = users.find((u) => u.id === senderId);
  const vendor = users.find((u) => u.id === otherId);
  if (!sender || !vendor) return null;
  // only someone writing to a vendor as a customer; approved vendors, admins and support never. Switching
  // to the vendor role isn't enough: a vendor whose licence isn't approved yet is limited like a customer
  if ((sender.type === UserType.VENDOR && sender.vendorProfile?.license_status === 'APPROVED') || has(sender, UserType.ADMIN)) return null;
  if (!has(vendor, UserType.VENDOR) || has(vendor, UserType.ADMIN)) return null;

  const [replies, accepted] = await Promise.all([
    prisma.message.count({ where: { conversationId: conversation.id, senderId: otherId, kind: { not: 'system' } } }),
    prisma.booking.count({ where: { ...acceptedBookingWhere, customer_id: senderId, vendor_id: otherId } }),
  ]);
  if (replies > 0 || accepted > 0) return null;

  const used = await prisma.message.count({ where: { conversationId: conversation.id, senderId, kind: { in: TYPED_KINDS } } });
  return { limit: CUSTOMER_MESSAGE_LIMIT, used, remaining: Math.max(0, CUSTOMER_MESSAGE_LIMIT - used), vendor_name: vendor.name?.trim() || 'the vendor' };
}

/** Refuses a typed message once the customer has used their messages. Returns the limit before sending. */
export async function assertUnderSendLimit(
  prisma: LimitReader,
  conversation: { id: string; is_group?: boolean | null; vendor_replied_at?: Date | null; participants: { userId: string }[] },
  senderId: string,
) {
  const limit = await sendLimitFor(prisma, conversation, senderId);
  if (limit && limit.remaining <= 0) throw new ForbiddenException(sendLimitMessage(limit.vendor_name));
  return limit;
}

/** The limit after one more message was sent (null once there's no limit). */
export const afterSend = (limit: SendLimit | null): SendLimit | null =>
  limit ? { ...limit, used: limit.used + 1, remaining: Math.max(0, limit.remaining - 1) } : null;
