"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Loader2, Users } from "lucide-react";
import { toast } from "react-toastify";
import { ChatService } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";

/**
 * Window event fired when a chat is archived or moved back (from the chat page or the sidebar), so the
 * sidebar list and its "Archived (n)" link stay right without a reload.
 */
export const CHAT_ARCHIVE_EVENT = "vendly:chat-archive";
export type ChatArchiveDetail = { conversation_id: string; archived: boolean };

/**
 * Archives a chat for me (or moves it back). Archiving is per person and a new message brings the chat
 * back. A 1:1 chat with a booking under way can't be archived: the server says why and we show that.
 */
export async function setChatArchived(conversationId: string, archive: boolean): Promise<boolean> {
  try {
    await (archive ? ChatService.archive(conversationId) : ChatService.unarchive(conversationId));
  } catch (e) {
    toast.error(errorMessage(e, archive ? "Could not archive this chat" : "Could not move this chat back"));
    return false;
  }
  toast.success(archive ? "Chat archived. A new message will bring it back." : "Chat moved back to your messages");
  window.dispatchEvent(new CustomEvent<ChatArchiveDetail>(CHAT_ARCHIVE_EVENT, { detail: { conversation_id: conversationId, archived: archive } }));
  return true;
}

/** The "Archived (n)" link under the chat list. Nothing when there are none. */
export function ArchivedLink({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Archived chats, ${count}`}
      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700"
    >
      <Archive className="w-4 h-4" /> Archived ({count})
    </button>
  );
}

export interface ArchivedConversation {
  conversation_id: string;
  is_group?: boolean;
  title?: string | null;
  unread?: number;
  opponent: { name: string; avatar_url?: string | null } | null;
  lastMessage: { text?: string | null; createdAt: string; attachments?: string[] } | null;
}

/**
 * The sidebar's archived view: my archived chats, each with "Unarchive". A chat moved back also fires
 * CHAT_ARCHIVE_EVENT (the sidebar listens for that); `onUnarchived` is for anything else.
 */
export default function ArchivedChatList({
  conversations,
  loading,
  onBack,
  onUnarchived,
}: {
  conversations: ArchivedConversation[];
  loading: boolean;
  onBack: () => void;
  onUnarchived?: (conversationId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const unarchive = async (id: string) => {
    setBusy(id);
    const ok = await setChatArchived(id, false);
    setBusy(null);
    if (ok) onUnarchived?.(id);
  };

  return (
    <section aria-label="Archived chats" className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <button type="button" onClick={onBack} aria-label="Back to all chats" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Archived chats</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Only hidden for you. A new message brings a chat back.</p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="Loading archived chats" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 px-4">No archived chats.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {conversations.map((c) => {
            const name = c.is_group ? c.title ?? "Event chat" : c.opponent?.name ?? "Unknown";
            const preview = c.lastMessage?.text ?? (c.lastMessage?.attachments?.length ? "Photo" : "No messages yet");
            return (
              <li key={c.conversation_id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/chat/${c.conversation_id}`} className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold flex-shrink-0">
                    {c.is_group ? <Users className="w-4 h-4" /> : name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{preview}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => unarchive(c.conversation_id)}
                  disabled={busy === c.conversation_id}
                  aria-label={`Unarchive chat with ${name}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                >
                  {busy === c.conversation_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                  Unarchive
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
