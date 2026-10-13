import { api } from './api';

// Shapes the chat screens use. The API's own shapes differ (see the Api* types below); the service
// translates so the screens stay simple. Previously this file called routes and fields that don't
// exist (/chat/conversation, conversation_id/content), so mobile chat never worked.

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
}

export interface LastMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
}

export interface Conversation {
  id: string;
  participants: Participant[];
  last_message?: LastMessage;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  file?: string;
  created_at: string;
  sender?: Participant;
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
  opponent: { userId: string; name: string; avatar_url?: string | null } | null;
  lastMessage: { text?: string | null; createdAt: string; attachments?: string[] } | null;
}

interface ApiMessage {
  id: string;
  text?: string | null;
  createdAt: string;
  attachments_url?: string[];
  sender?: { id: string; name: string; avatar?: string | null; avatar_url?: string | null };
}

/** Converts an API message (REST or socket `message` event) to the screens' shape. */
export function toMessage(raw: ApiMessage, conversationId = ''): Message {
  return {
    id: raw.id,
    conversation_id: conversationId,
    sender_id: raw.sender?.id ?? '',
    content: raw.text ?? '',
    file: raw.attachments_url?.[0],
    created_at: raw.createdAt,
    sender: raw.sender
      ? { id: raw.sender.id, name: raw.sender.name, avatar: raw.sender.avatar_url ?? raw.sender.avatar ?? undefined }
      : undefined,
  };
}

function toConversation(c: ApiConversation): Conversation {
  const last = c.lastMessage;
  return {
    id: c.conversation_id,
    participants: c.opponent
      ? [{ id: c.opponent.userId, name: c.opponent.name, avatar: c.opponent.avatar_url ?? undefined }]
      : [],
    last_message: last
      ? {
          id: '',
          content: last.text || (last.attachments?.length ? 'Photo' : ''),
          created_at: last.createdAt,
          sender_id: '',
        }
      : undefined,
    updated_at: last?.createdAt ?? '',
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
      params: { page: params?.page ?? 1, perPage: params?.limit ?? 50 },
    });
    // API returns oldest first; the chat list is inverted, so it wants newest first.
    const messages = ((res.data?.data ?? []) as ApiMessage[]).map((m) => toMessage(m, conversationId)).reverse();
    return envelope(!!res.data?.success, messages);
  },

  sendMessage: async (data: SendMessageData) => {
    const res = await api.post('/chat/message/send-message', {
      conversationId: data.conversation_id,
      text: data.content,
    });
    return envelope(!!res.data?.success, toMessage(res.data?.data as ApiMessage, data.conversation_id));
  },

  createConversation: async (data: CreateConversationData) => {
    const res = await api.post('/chat/conversation/create-conversation', { participant_id: data.participant_id });
    const id = res.data?.conversation?.id ?? res.data?.data?.id;
    return envelope(!!res.data?.success, { id } as Pick<Conversation, 'id'>);
  },
};
