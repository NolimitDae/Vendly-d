import { ForbiddenException } from '@nestjs/common';

/** Shown to the person who did the blocking when they try to send. */
export const BLOCKED_BY_ME_MESSAGE = 'You blocked this person. Unblock them to send a message.';
/** Shown to the person who was blocked. Deliberately plain. */
export const BLOCKED_ME_MESSAGE = "You can't message this person.";

type BlockReader = {
  userBlock: { findMany: (args: any) => Promise<{ blocker_id: string; blocked_id: string }[]> };
};

/** Block state between `me` and `other`, from `me`'s point of view. */
export async function blockState(prisma: BlockReader, me: string, other: string) {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blocker_id: me, blocked_id: other }, { blocker_id: other, blocked_id: me }] },
    select: { blocker_id: true, blocked_id: true },
  });
  return {
    blocked_by_me: rows.some((r) => r.blocker_id === me),
    blocked_me: rows.some((r) => r.blocker_id === other),
  };
}

/** Everyone `me` has blocked and everyone who has blocked `me`, for building lists in one query. */
export async function blockSets(prisma: BlockReader, me: string) {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blocker_id: me }, { blocked_id: me }] },
    select: { blocker_id: true, blocked_id: true },
  });
  const blockedByMe = new Set<string>();
  const blockedMe = new Set<string>();
  for (const r of rows) {
    if (r.blocker_id === me) blockedByMe.add(r.blocked_id);
    else blockedMe.add(r.blocker_id);
  }
  return { blockedByMe, blockedMe };
}

/**
 * Refuses a 1:1 message while either person has blocked the other. Group chats aren't filtered.
 * Bookings, contracts and everything else carry on; only sending is stopped.
 */
export async function assertCanMessage(prisma: BlockReader, senderId: string, recipientId: string) {
  const state = await blockState(prisma, senderId, recipientId);
  if (state.blocked_by_me) throw new ForbiddenException(BLOCKED_BY_ME_MESSAGE);
  if (state.blocked_me) throw new ForbiddenException(BLOCKED_ME_MESSAGE);
}
