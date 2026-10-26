"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Archive, MessageSquare, Search, Loader2, Plus, X, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ChatService, type InboxCounts, type InboxTab } from "@/service/chat/chat.service";
import { CHAT_READ_EVENT } from "@/components/chat/presence";
import InboxTabs from "@/components/chat/InboxTabs";
import ArchivedChatList, { ArchivedLink, CHAT_ARCHIVE_EVENT, setChatArchived, type ArchivedConversation, type ChatArchiveDetail } from "@/components/chat/ArchivedChats";
import { whoAmI } from "@/lib/currentUser";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

interface Opponent {
  userId: string;
  name: string;
  avatar_url?: string | null;
}

interface Conversation {
  conversation_id: string;
  is_group?: boolean;
  title?: string | null;
  member_count?: number;
  unread?: number;
  opponent: Opponent | null;
  lastMessage: {
    kind?: string;
    sender_name?: string | null;
    text?: string;
    createdAt: string;
    attachments?: string[];
  } | null;
}

interface ChatUser {
  id: string;
  name: string;
  avatar?: string | null;
  type: string;
}

const EMPTY_TAB: Record<InboxTab, string> = {
  clients: "No clients yet. Chats with customers who have booked you or sent a booking request show up here.",
  inquiries: "No inquiries. Questions from customers who haven't booked yet show up here.",
};

// The contacts endpoint no longer returns emails, so show each person's role instead.
const ROLE_LABEL: Record<string, string> = { VENDOR: "Vendor", CLIENT: "Customer", EVENT_PLANNER: "Event planner" };

export default function ConversationSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  // vendors get their inbox in two tabs (null until we know who's signed in)
  const [isVendor, setIsVendor] = useState<boolean | null>(null);
  const [tab, setTab] = useState<InboxTab>("clients");
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  // chats I archived: a count for the "Archived (n)" link, and their own list when it's open
  const [archivedCount, setArchivedCount] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<ArchivedConversation[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  // bumped when a chat is archived or comes back, to fetch the list (and tab counts) again
  const [reload, setReload] = useState(0);
  const listRef = useRef(conversations);
  listRef.current = conversations;

  useEffect(() => {
    whoAmI().then((me) => setIsVendor(me.type === "VENDOR"));
  }, []);

  useEffect(() => {
    if (isVendor === null) return;
    let stale = false;
    // a refresh after archiving keeps the list on screen
    if (!listRef.current.length) setLoading(true);
    (isVendor ? ChatService.getInboxTab(tab) : ChatService.getConversations())
      .then((res) => {
        if (stale || !res.data?.success) return;
        setConversations(res.data.conversations ?? []);
        if (isVendor) setCounts(res.data.counts ?? null);
        setArchivedCount(res.data.archived_count ?? 0);
      })
      .catch(() => {})
      .finally(() => !stale && setLoading(false));
    // a slow answer for a tab already left doesn't replace the new one
    return () => {
      stale = true;
    };
  }, [isVendor, tab, reload]);

  useEffect(() => {
    if (!showArchived) return;
    let stale = false;
    setArchivedLoading(true);
    ChatService.getArchived()
      .then((res) => {
        if (stale || !res.data?.success) return;
        setArchived(res.data.conversations ?? []);
        setArchivedCount(res.data.archived_count ?? 0);
      })
      .catch(() => {})
      .finally(() => !stale && setArchivedLoading(false));
    return () => {
      stale = true;
    };
  }, [showArchived]);

  // archived or brought back here or on the chat page: drop it from the open list, then refresh
  useEffect(() => {
    const onArchive = (e: Event) => {
      const d = (e as CustomEvent<ChatArchiveDetail>).detail;
      if (!d) return;
      if (d.archived) setConversations((list) => list.filter((c) => c.conversation_id !== d.conversation_id));
      else setArchived((list) => list.filter((c) => c.conversation_id !== d.conversation_id));
      setReload((n) => n + 1);
    };
    window.addEventListener(CHAT_ARCHIVE_EVENT, onArchive);
    return () => window.removeEventListener(CHAT_ARCHIVE_EVENT, onArchive);
  }, []);

  // the open chat marked itself read: drop its unread badge (and the tab's)
  useEffect(() => {
    const onRead = (e: Event) => {
      const id = (e as CustomEvent<{ conversation_id: string }>).detail?.conversation_id;
      const read = listRef.current.find((c) => c.conversation_id === id && c.unread);
      if (!read) return;
      setConversations((list) => list.map((c) => (c.conversation_id === id ? { ...c, unread: 0 } : c)));
      const n = read.unread ?? 0;
      setCounts((cs) => (cs ? { ...cs, [tab]: { ...cs[tab], unread: Math.max(0, cs[tab].unread - 1), unread_messages: Math.max(0, cs[tab].unread_messages - n) } } : cs));
    };
    window.addEventListener(CHAT_READ_EVENT, onRead);
    return () => window.removeEventListener(CHAT_READ_EVENT, onRead);
  }, [tab]);

  const openNewChat = () => {
    setShowNewChat(true);
    if (users.length === 0) {
      setUsersLoading(true);
      ChatService.getUsers()
        .then((res) => {
          if (res.data?.success) setUsers(res.data.data ?? []);
        })
        .catch(() => {})
        .finally(() => setUsersLoading(false));
    }
  };

  const startConversation = async (userId: string) => {
    setStarting(userId);
    try {
      const res = await ChatService.createConversation(userId);
      if (res.data?.success) {
        const id = res.data.conversation?.id ?? res.data.conversation?.conversation_id;
        if (id) {
          setShowNewChat(false);
          setUserSearch("");
          router.push(`/chat/${id}`);
        }
      }
    } catch {
      // silent
    } finally {
      setStarting(null);
    }
  };

  const nameOf = (c: Pick<Conversation, "is_group" | "title"> & { opponent: { name: string } | null }) => (c.is_group ? c.title ?? "Event chat" : c.opponent?.name ?? "Unknown");
  const filtered = conversations.filter((c) =>
    nameOf(c).toLowerCase().includes(search.toLowerCase()),
  );

  const filteredUsers = users.filter((u) => (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Messages</h1>
          <button
            onClick={openNewChat}
            className="flex items-center gap-1 gradient-bg text-white px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          />
        </div>
        {isVendor && !showArchived && (
          <InboxTabs
            tab={tab}
            counts={counts}
            onChange={(t) => {
              if (t === tab) return;
              setConversations([]);
              setTab(t);
            }}
          />
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {showArchived ? (
          <ArchivedChatList
            conversations={archived.filter((c) => nameOf(c).toLowerCase().includes(search.toLowerCase()))}
            loading={archivedLoading}
            onBack={() => setShowArchived(false)}
          />
        ) : loading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center px-4">
            <MessageSquare className="w-9 h-9 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-400 text-sm">
              {search ? "No conversations match your search" : isVendor ? EMPTY_TAB[tab] : "No conversations yet"}
            </p>
            {!search && (
              <button
                onClick={openNewChat}
                className="mt-3 text-sm text-primary hover:opacity-80 transition font-medium"
              >
                Start a new conversation
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map((conv) => {
              const isActive = pathname === `/chat/${conv.conversation_id}`;
              const name = nameOf(conv);
              const initial = name[0]?.toUpperCase() ?? "?";
              const body =
                conv.lastMessage?.kind === "quote"
                  ? `💬 ${conv.lastMessage.text ?? "Quote"}`
                  : conv.lastMessage?.text ?? (conv.lastMessage?.attachments?.length ? "📎 Attachment" : conv.is_group ? `${conv.member_count ?? 0} members` : "No messages yet");
              const preview = conv.is_group && conv.lastMessage?.sender_name ? `${conv.lastMessage.sender_name.split(" ")[0]}: ${body}` : body;
              const time = conv.lastMessage?.createdAt
                ? dayjs(conv.lastMessage.createdAt).fromNow()
                : "";

              return (
                <li key={conv.conversation_id} className="relative group">
                  <Link
                    href={`/chat/${conv.conversation_id}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 transition border-l-2",
                      isActive
                        ? "bg-primary/5 dark:bg-primary/10 border-l-primary"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-transparent",
                    )}
                  >
                    {conv.is_group ? (
                      <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : conv.opponent?.avatar_url ? (
                      <Image
                        src={conv.opponent.avatar_url}
                        alt={name}
                        width={44}
                        height={44}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-base flex-shrink-0">
                        {initial}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "font-semibold text-sm truncate",
                            isActive
                              ? "text-primary"
                              : "text-gray-900 dark:text-white",
                          )}
                        >
                          {name}
                        </span>
                        {time && (
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{time}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={cn("text-xs truncate flex-1", conv.unread ? "text-gray-900 dark:text-white font-medium" : "text-gray-500 dark:text-gray-400")}>
                          {preview}
                        </p>
                        {!!conv.unread && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center" aria-label={`${conv.unread} unread`}>
                            {conv.unread > 99 ? "99+" : conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  {/* row action, on hover or keyboard focus (touch screens use the chat's menu) */}
                  <button
                    type="button"
                    onClick={() => setChatArchived(conv.conversation_id, true)}
                    aria-label={`Archive chat with ${name}`}
                    title="Archive chat"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [@media(hover:none)]:hidden transition"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!showArchived && !loading && <ArchivedLink count={archivedCount} onOpen={() => setShowArchived(true)} />}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">New Conversation</h2>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setUserSearch("");
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search your contacts..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>

              <div className="max-h-72 overflow-y-auto">
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No contacts yet. You can message anyone you have a booking with.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredUsers.map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => startConversation(u.id)}
                          disabled={starting === u.id}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left disabled:opacity-60"
                        >
                          {u.avatar ? (
                            <Image
                              src={u.avatar}
                              alt={u.name}
                              width={36}
                              height={36}
                              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                              unoptimized
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                              {u.name[0]?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{ROLE_LABEL[u.type] ?? ""}</p>
                          </div>
                          {starting === u.id && (
                            <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
