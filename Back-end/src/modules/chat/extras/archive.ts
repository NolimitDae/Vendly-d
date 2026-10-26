import { Prisma } from 'prisma/generated/client';

/**
 * Chat archive (owner's ask, Nov 2026: "give both customers and vendors the option to archive past
 * booking chats"). Archiving is per person (Participant.archivedAt): the chat leaves that person's main
 * list only, the other person and the messages are untouched. Any new message in the chat, from the
 * other person, from the person themselves or a system notice, brings it back for everyone who had
 * archived it, so nothing new gets missed.
 */

/**
 * Nested write for the conversation update a new message makes: clears every participant's archive.
 * `{ updatedAt: new Date(), participants: UNARCHIVE_ALL }`
 */
export const UNARCHIVE_ALL = {
  updateMany: { where: { archivedAt: { not: null } }, data: { archivedAt: null } },
} satisfies Prisma.ParticipantUpdateManyWithoutConversationNestedInput;

/** Same, for a message saved without a conversation update (system notices). */
export function unarchiveChat(db: { participant: { updateMany: (args: Prisma.ParticipantUpdateManyArgs) => Promise<unknown> } }, conversationId: string) {
  return db.participant.updateMany({ where: { conversationId, archivedAt: { not: null } }, data: { archivedAt: null } });
}

/** Read from `?archived=`: 1 / true asks for the archived list. */
export function wantsArchived(v: string | undefined) {
  return v === '1' || v === 'true';
}
