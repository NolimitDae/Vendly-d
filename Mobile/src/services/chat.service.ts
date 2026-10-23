import { api } from './api';

// Shapes the chat screens use. The API's own shapes differ (see the Api* types below); the service
// translates so the screens stay simple.

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  role?: string | null;
  last_read_at?: string | null;
}

export interface LastMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_name?: string | null;
}

export interface Conversation {
  id: string;
  participants: Participant[];
  last_message?: LastMessage;
  updated_at: string;
  is_group?: boolean;
  title?: string | null;
  event_id?: string | null;
  member_count?: number;
  unread?: number;
}

export type QuoteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';

export interface Quote {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  expires_at: string;
  status: QuoteStatus;
  vendor_id: string;
  customer_id: string;
  event_id?: string | null;
  booking_id?: string | null;
  listing: { id: string; title: string; image: string | null } | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  file?: string;
  created_at: string;
  sender?: Participant;
  kind: 'text' | 'quote' | 'system';
  quote?: Quote | null;
  contact_flagged?: boolean;
}

/** Group info, pinned message and read positions that come with the message list. */
export interface ConversationInfo {
  id: string;
  is_group: boolean;
  title?: string | null;
  event_id?: string | null;
  pinned: Message | null;
  participants: Participant[];
}

export interface SendMessageData {
  conversation_id: string;
  content: string;
}

export interface CreateConversationData {
  participant_id: string;
}

export interface MessageListParams {
  page?: number;
  limit?: number;
}

// ─── API shapes (Back-end/src/modules/chat) ─────────────────────────────────────

interface ApiConversation {
  conversation_id: string;
  is_group?: boolean;
  title?: string | null;
  event_id?: string | null;
  member_count?: number;
  unread?: number;
  opponent: { userId: string; name: string; avatar_url?: string | null } | null;
  lastMessage: { text?: string | null; kind?: string; sender_name?: string | null; createdAt: string; attachments?: string[] } | null;
}

interface ApiMessage {
  id: string;
  conversation_id?: string;
  text?: string | null;
  kind?: string;
  createdAt: string;
  attachments_url?: string[];
  contact_flagged?: boolean;
  quote?: Quote | null;
  sender?: { id: string; name: string; avatar?: string | null; avatar_url?: string | null };
}

interface ApiConversationInfo {
  id: string;
  is_group: boolean;
  title?: string | null;
  event_id?: string | null;
  pinned: ApiMessage | null;
  participants: { id: string; name: string; role?: string | null; avatar_url?: string | null; last_read_at?: string | null }[];
}

/** Converts an API message (REST or socket `message` event) to the screens' shape. */
export function toMessage(raw: ApiMessage, conversationId = ''): Message {
  return {
    id: raw.id,
    conversation_id: raw.conversation_id ?? conversationId,
    sender_id: raw.sender?.id ?? '',
    content: raw.text ?? '',
    file: raw.attachments_url?.[0],
    created_at: raw.createdAt,
    kind: (raw.kind as Message['kind']) ?? 'text',
    quote: raw.quote ?? null,
    contact_flagged: raw.contact_flagged,
    sender: raw.sender ? { id: raw.sender.id, name: raw.sender.name, avatar: raw.sender.avatar_url ?? raw.sender.avatar ?? undefined } : undefined,
  };
}

function toConversation(c: ApiConversation): Conversation {
  const last = c.lastMessage;
  const preview = last ? (last.kind === 'quote' ? `💬 ${last.text ?? 'Quote'}` : last.text || (last.attachments?.length ? 'Photo' : '')) : '';
  return {
    id: c.conversation_id,
    is_group: !!c.is_group,
    title: c.title ?? null,
    event_id: c.event_id ?? null,
    member_count: c.member_count,
    unread: c.unread ?? 0,
    participants: c.opponent ? [{ id: c.opponent.userId, name: c.opponent.name, avatar: c.opponent.avatar_url ?? undefined }] : [],
    last_message: last ? { id: '', content: preview, created_at: last.createdAt, sender_id: '', sender_name: last.sender_name } : undefined,
    updated_at: last?.createdAt ?? '',
  };
}

function toInfo(c: ApiConversationInfo | undefined, conversationId: string): ConversationInfo | null {
  if (!c) return null;
  return {
    id: c.id,
    is_group: c.is_group,
    title: c.title,
    event_id: c.event_id,
    pinned: c.pinned ? toMessage(c.pinned, conversationId) : null,
    participants: c.participants.map((p) => ({ id: p.id, name: p.name, role: p.role, avatar: p.avatar_url ?? undefined, last_read_at: p.last_read_at })),
  };
}

// Responses keep the { data: { success, data } } envelope the screens already read.
const envelope = <T,>(success: boolean, data: T) => ({ data: { success, data } });

export const ChatService = {
  getConversations: async () => {
    const res = await api.get('/chat/conversation/conversation-list');
    return envelope(!!res.data?.success, ((res.data?.conversations ?? []) as ApiConversation[]).map(toConversation));
  },

  getMessages: async (conversationId: string, params?: MessageListParams) => {
    const res = await api.get(`/chat/message/all-message/${conversationId}`, {
      params: { page: params?.page ?? 1, perPage: params?.limit ?? 100 },
    });
    // API returns oldest first; the chat list is inverted, so it wants newest first.
    // an empty chat comes back as a nested page object rather than an array
    const list = Array.isArray(res.data?.data) ? res.data.data : res.data?.data?.data ?? [];
    const messages = (list as ApiMessage[]).map((m) => toMessage(m, conversationId)).reverse();
    return { data: { success: !!res.data?.success, data: messages, conversation: toInfo(res.data?.conversation, conversationId) } };
  },

  sendMessage: async (data: SendMessageData) => {
    const res = await api.post('/chat/message/send-message', { conversationId: data.conversation_id, text: data.content });
    return { data: { success: !!res.data?.success, data: toMessage(res.data?.data as ApiMessage, data.conversation_id), warning: res.data?.warning as { text: string } | null } };
  },

  /** Marks the other side's messages read; they get a `conversationRead` socket event ("Seen"). */
  markRead: (conversationId: string) => api.post(`/chat/message/read-message/${conversationId}`),

  createConversation: async (data: CreateConversationData) => {
    const res = await api.post('/chat/conversation/create-conversation', { participant_id: data.participant_id });
    const id = res.data?.conversation?.id ?? res.data?.conversation?.conversation_id ?? res.data?.data?.id;
    return envelope(!!res.data?.success, { id } as Pick<Conversation, 'id'>);
  },

  openEventChat: (eventId: string) => api.post<{ success: boolean; data: { conversation_id: string } }>(`/chat/events/${eventId}/open`),
  pin: (conversationId: string, messageId: string | null) => api.post(`/chat/conversation/${conversationId}/pin`, { message_id: messageId }),
  sendQuote: (conversationId: string, body: { listing_id: string; title: string; description?: string; amount: number; expires_in_days?: number }) =>
    api.post(`/chat/conversation/${conversationId}/quotes`, body),
  declineQuote: (quoteId: string) => api.post(`/chat/quotes/${quoteId}/decline`),
  withdrawQuote: (quoteId: string) => api.post(`/chat/quotes/${quoteId}/withdraw`),
};

// Mirrors the backend check (Back-end/src/modules/chat/extras/contact-warning.ts) so the app can
// remind before sending. It never blocks a message.
const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[A-Z]{2,}/i;
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{8,22}\d/g;
const DATE_LIKE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
const OFF_PLATFORM = /\b(whats\s?app|telegram|signal app|wechat|venmo|cash\s?app|zelle|paypal\.me|text me at|call me at|dm me on|my (?:cell|number) is)\b/i;

export function sharesContact(text: string): boolean {
  if (EMAIL.test(text) || OFF_PLATFORM.test(text)) return true;
  return (text.match(PHONE_CANDIDATE) ?? ([] as string[])).some((m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 && !DATE_LIKE.test(m.trim());
  });
}

export const CONTACT_WARNING = 'Keep it in Vendly to stay protected. Payments and agreements made outside Vendly aren’t covered by Vendly Protection.';
