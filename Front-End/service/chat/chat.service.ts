import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export type QuoteStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";

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

export interface ChatMessage {
  id: string;
  conversation_id?: string;
  text?: string | null;
  kind?: "text" | "quote" | "system";
  createdAt: string;
  status?: string;
  contact_flagged?: boolean;
  quote?: Quote | null;
  attachments_url?: string[];
  sender: { id: string; name: string; avatar_url?: string | null; avatar?: string | null } | null;
}

export interface ConversationInfo {
  id: string;
  is_group: boolean;
  title?: string | null;
  event_id?: string | null;
  pinned: ChatMessage | null;
  participants: { id: string; name: string; role?: string | null; avatar_url?: string | null; last_read_at?: string | null }[];
}

export const ChatService = {
  getConversations: async () =>
    Fetch.get("/chat/conversation/conversation-list", authHeaders()),

  getConversation: async (id: string) =>
    Fetch.get(`/chat/conversation/single-conversation/${id}`, authHeaders()),

  createConversation: async (participantId: string) =>
    Fetch.post(
      "/chat/conversation/create-conversation",
      { participant_id: participantId },
      authHeaders(),
    ),

  /** Messages oldest first, plus `conversation` (group info, pinned message, read positions). */
  getMessages: async (conversationId: string, page = 1, perPage = 200) =>
    Fetch.get(
      `/chat/message/all-message/${conversationId}?page=${page}&perPage=${perPage}`,
      authHeaders(),
    ),

  sendMessage: async (conversationId: string, text: string) =>
    Fetch.post("/chat/message/send-message", { conversationId, text }, authHeaders()),

  /** Marks the other side's messages read; they get a `conversationRead` socket event ("Seen"). */
  markAsRead: async (conversationId: string) =>
    Fetch.post(`/chat/message/read-message/${conversationId}`, {}, authHeaders()),

  getUsers: async () => Fetch.get("/chat/conversation/all-user", authHeaders()),

  openEventChat: (eventId: string) => Fetch.post(`/chat/events/${eventId}/open`, {}, authHeaders()),
  pin: (conversationId: string, messageId: string | null) => Fetch.post(`/chat/conversation/${conversationId}/pin`, { message_id: messageId }, authHeaders()),
  sendQuote: (conversationId: string, body: { listing_id: string; title: string; description?: string; amount: number; expires_in_days?: number }) =>
    Fetch.post(`/chat/conversation/${conversationId}/quotes`, body, authHeaders()),
  getQuote: (quoteId: string) => Fetch.get(`/chat/quotes/${quoteId}`, authHeaders()),
  declineQuote: (quoteId: string) => Fetch.post(`/chat/quotes/${quoteId}/decline`, {}, authHeaders()),
  withdrawQuote: (quoteId: string) => Fetch.post(`/chat/quotes/${quoteId}/withdraw`, {}, authHeaders()),
};

// Mirrors Back-end/src/modules/chat/extras/contact-warning.ts so the site can remind before sending.
const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*[A-Z]{2,}/i;
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{8,22}\d/g;
const DATE_LIKE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
const OFF_PLATFORM = /\b(whats\s?app|telegram|signal app|wechat|venmo|cash\s?app|zelle|paypal\.me|text me at|call me at|dm me on|my (?:cell|number) is)\b/i;

export function sharesContact(text: string): boolean {
  if (EMAIL.test(text) || OFF_PLATFORM.test(text)) return true;
  return (text.match(PHONE_CANDIDATE) ?? ([] as string[])).some((m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 && !DATE_LIKE.test(m.trim());
  });
}

export const CONTACT_WARNING = "Keep it in Vendly to stay protected. Payments and agreements made outside Vendly aren’t covered by Vendly Protection.";
