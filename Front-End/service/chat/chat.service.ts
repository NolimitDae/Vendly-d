import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

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

  getMessages: async (conversationId: string, page = 1, perPage = 50) =>
    Fetch.get(
      `/chat/message/all-message/${conversationId}?page=${page}&perPage=${perPage}`,
      authHeaders(),
    ),

  sendMessage: async (conversationId: string, text: string) =>
    Fetch.post("/chat/message/send-message", { conversationId, text }, authHeaders()),

  markAsRead: async (conversationId: string) =>
    Fetch.get(`/chat/message/read-message/${conversationId}`, authHeaders()),

  getUsers: async () => Fetch.get("/chat/conversation/all-user", authHeaders()),
};
