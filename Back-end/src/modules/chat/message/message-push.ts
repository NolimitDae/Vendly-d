/** At most one push per conversation per recipient in this window, so a burst of messages is one push. */
export const CHAT_PUSH_WINDOW_SECONDS = 120;
const PREVIEW_LENGTH = 100;

export const chatPushKey = (conversationId: string, userId: string) => `chat_push:${conversationId}:${userId}`;

/** The push for a new message: who sent it and a short preview (never file names or links to files). */
export function chatPush(m: { senderName?: string | null; text?: string | null; attachments?: string[] | null; groupTitle?: string | null }) {
  const name = m.senderName?.trim() || 'Someone';
  const text = (m.text ?? '').replace(/\s+/g, ' ').trim();
  const files = m.attachments?.length ?? 0;
  const body = text
    ? text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…` : text
    : files > 1 ? `Sent ${files} attachments` : files === 1 ? 'Sent an attachment' : 'Sent a message';
  return { title: m.groupTitle ? `${name} in ${m.groupTitle}` : name, body };
}
