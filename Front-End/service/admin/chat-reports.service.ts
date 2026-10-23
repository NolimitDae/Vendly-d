import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";
import type { ChatMessage, ReportReason } from "../chat/chat.service";

const json = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
    "Content-Type": "application/json",
  },
});

export interface ReportPerson {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  /** 1 active, 0 suspended */
  status: number | null;
  type: string | null;
}

export interface ChatReport {
  id: string;
  created_at: string;
  reason: ReportReason;
  details: string | null;
  status: "OPEN" | "ACTIONED" | "DISMISSED";
  resolved_at: string | null;
  resolved_by: { id: string; name: string | null } | null;
  resolution_note: string | null;
  reporter: ReportPerson | null;
  reported: ReportPerson | null;
  conversation_id: string | null;
  message_id: string | null;
  /** The reported message; null if none was picked or the sender deleted it. */
  message: ChatMessage | null;
  /** The copy of the reported message kept when the report was made (its files are kept too). */
  message_copy?: { text: string | null; attachments: string[]; attachments_url: string[] } | null;
  /** The reported message was deleted by the sender after the report. */
  message_deleted?: boolean;
  /** Up to 10 messages leading up to the report, oldest first. */
  context: ChatMessage[];
}

/** Admin queue of people reported from chat (Back-end/src/modules/chat/safety). */
export const ChatReportsService = {
  list: (status: "open" | "done", page = 1) => Fetch.get(`/admin/chat-reports?status=${status}&page=${page}`, json()),
  resolve: (id: string, action: "dismiss" | "actioned", note?: string) => Fetch.post(`/admin/chat-reports/${id}/resolve`, { action, note }, json()),
};
