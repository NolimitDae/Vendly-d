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

/**
 * A customer can send 3 messages to a vendor until the vendor replies or accepts a booking
 * (Back-end/src/modules/chat/extras/send-limit.ts). Null when there's no limit.
 */
export interface SendLimit {
  limit: number;
  used: number;
  remaining: number;
  vendor_name: string;
}

/** Vendors' inbox tabs (Back-end/src/modules/chat/extras/inbox.ts). */
export type InboxTab = "clients" | "inquiries";
/** Per tab: chats in it, chats with something unread, unread messages. */
export type InboxCounts = Record<InboxTab, { total: number; unread: number; unread_messages: number }>;

export interface ConversationInfo {
  id: string;
  is_group: boolean;
  title?: string | null;
  event_id?: string | null;
  pinned: ChatMessage | null;
  participants: { id: string; name: string; role?: string | null; avatar_url?: string | null; last_read_at?: string | null }[];
  /** 1:1 chats only: I blocked them / they blocked me. Either way nobody can send. */
  blocked_by_me?: boolean;
  blocked_me?: boolean;
  /** messages left until the vendor replies (customers writing to a vendor only) */
  send_limit?: SendLimit | null;
  /** when I archived this chat (null: it's in my main list) */
  archived_at?: string | null;
}

export type ReportReason = "spam" | "harassment" | "scam" | "inappropriate" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "scam", label: "Scam or fraud" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];

export interface ReportBody {
  reported_id: string;
  reason: ReportReason;
  details?: string;
  conversation_id?: string;
  message_id?: string;
  block?: boolean;
}

/** Same limit as the API (Back-end/src/modules/chat/message/message.controller.ts). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Photos per message (the API takes up to 10 attachments). */
export const MAX_PHOTOS = 10;

/**
 * Which of the picked files can join the photos already chosen: photos only, 10 MB each, 10 in all.
 * `error` says why any were left out.
 */
export function acceptPhotos(alreadyChosen: number, picked: File[]): { files: File[]; error: string | null } {
  const errors = new Set<string>();
  const files: File[] = [];
  for (const f of picked) {
    if (!f.type.startsWith("image/")) errors.add("Only photos can be sent");
    else if (f.size > MAX_PHOTO_BYTES) errors.add(`${f.name || "A photo"} is over 10 MB`);
    else if (alreadyChosen + files.length >= MAX_PHOTOS) errors.add(`You can send up to ${MAX_PHOTOS} photos at a time`);
    else files.push(f);
  }
  return { files, error: errors.size ? [...errors].join(". ") : null };
}

export const ChatService = {
  getConversations: async () =>
    Fetch.get("/chat/conversation/conversation-list", authHeaders()),

  /** Vendors: one inbox tab, with `counts` for both tabs' badges. */
  getInboxTab: async (tab: InboxTab) =>
    Fetch.get(`/chat/conversation/conversation-list?tab=${tab}`, authHeaders()),

  /**
   * Chats I archived (Back-end/src/modules/chat/extras/archive.ts). Every list answer carries
   * `archived_count` for the "Archived (n)" link; archived chats are left out of the main list and tabs.
   */
  getArchived: async () =>
    Fetch.get("/chat/conversation/conversation-list?archived=1", authHeaders()),
  /** For me only. Refused (400, with the reason) while a 1:1 chat's booking is under way. */
  archive: (conversationId: string) => Fetch.post(`/chat/conversation/${conversationId}/archive`, {}, authHeaders()),
  unarchive: (conversationId: string) => Fetch.post(`/chat/conversation/${conversationId}/unarchive`, {}, authHeaders()),

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

  /** With photos (up to 10) the message goes as multipart (`attachments`); text is optional then. */
  sendMessage: async (conversationId: string, text: string, photos?: File[]) => {
    if (!photos?.length) return Fetch.post("/chat/message/send-message", { conversationId, text }, authHeaders());
    const body = new FormData();
    body.append("conversationId", conversationId);
    if (text) body.append("text", text);
    photos.forEach((f) => body.append("attachments", f));
    return Fetch.post("/chat/message/send-message", body, { headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` } });
  },

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

  // Block stops messages both ways in a 1:1 chat; bookings and contracts carry on.
  block: (userId: string) => Fetch.post(`/chat/block/${userId}`, {}, authHeaders()),
  unblock: (userId: string) => Fetch.delete(`/chat/block/${userId}`, authHeaders()),
  getBlocks: () => Fetch.get("/chat/blocks", authHeaders()),
  report: (body: ReportBody) => Fetch.post("/chat/report", body, authHeaders()),
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
