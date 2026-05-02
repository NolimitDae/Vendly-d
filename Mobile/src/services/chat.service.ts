import { api } from './api';

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
  file?: string;
}

export interface CreateConversationData {
  participant_id: string;
}

export interface MessageListParams {
  page?: number;
  limit?: number;
}

export const ChatService = {
  getConversations: () =>
    api.get<{ success: boolean; data: Conversation[] }>('/chat/conversation'),

  getMessages: (conversationId: string, params?: MessageListParams) =>
    api.get<{ success: boolean; data: Message[]; meta?: any }>(
      `/chat/message/all-message/${conversationId}`,
      { params },
    ),

  sendMessage: (data: SendMessageData) =>
    api.post<{ success: boolean; data: Message }>('/chat/message/send-message', data),

  createConversation: (data: CreateConversationData) =>
    api.post<{ success: boolean; data: Conversation }>('/chat/conversation', data),
};
