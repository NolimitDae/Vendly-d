"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageSquare, Search, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ChatService } from "@/service/chat/chat.service";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

interface Opponent {
  userId: string;
  name: string;
  avatar_url?: string | null;
}

interface Conversation {
  conversation_id: string;
  opponent: Opponent | null;
  lastMessage: {
    text?: string;
    createdAt: string;
    attachments?: string[];
  } | null;
}

interface ChatUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  type: string;
}

export default function ChatInboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    ChatService.getConversations()
      .then((res) => {
        if (res.data?.success) {
          setConversations(res.data.conversations ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        if (id) router.push(`/chat/${id}`);
      }
    } catch {
      // silent
    } finally {
      setStarting(null);
    }
  };

  const filtered = conversations.filter((c) =>
    c.opponent?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
          <button
            onClick={openNewChat}
            className="flex items-center gap-1.5 gradient-bg text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
          />
        </div>

        {/* Conversation list */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-400 text-sm">
                {search ? "No conversations match your search" : "No conversations yet"}
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
                const name = conv.opponent?.name ?? "Unknown";
                const initial = name[0]?.toUpperCase() ?? "?";
                const preview = conv.lastMessage?.text
                  ?? (conv.lastMessage?.attachments?.length ? "📎 Attachment" : "No messages yet");
                const time = conv.lastMessage?.createdAt
                  ? dayjs(conv.lastMessage.createdAt).fromNow()
                  : "";

                return (
                  <li key={conv.conversation_id}>
                    <Link
                      href={`/chat/${conv.conversation_id}`}
                      className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                    >
                      {conv.opponent?.avatar_url ? (
                        <Image
                          src={conv.opponent.avatar_url}
                          alt={name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                          unoptimized
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg flex-shrink-0">
                          {initial}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                            {name}
                          </span>
                          {time && (
                            <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {preview}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">New Conversation</h2>
              <button
                onClick={() => { setShowNewChat(false); setUserSearch(""); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
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
                  <p className="text-center text-sm text-gray-400 py-8">No users found</p>
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
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
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
