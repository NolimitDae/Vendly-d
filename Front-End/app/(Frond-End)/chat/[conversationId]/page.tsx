"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  Check,
  CheckCheck,
} from "lucide-react";
import dayjs from "dayjs";
import { CookieHelper } from "@/helper/cookie.helper";
import { ChatService } from "@/service/chat/chat.service";
import { useSocket } from "@/hooks/useSocket";
import { cn } from "@/lib/utils";

interface Sender {
  id: string;
  name: string;
  avatar?: string | null;
}

interface Message {
  id: string;
  text?: string;
  createdAt: string;
  status?: string;
  sender: Sender;
}

interface Participant {
  userId: string;
  name: string;
  avatar_url?: string | null;
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "READ") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "DELIVERED") return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
  return <Check className="w-3.5 h-3.5 text-gray-400" />;
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const socket = useSocket();

  const [messages, setMessages] = useState<Message[]>([]);
  const [opponent, setOpponent] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    const token = CookieHelper.get({ key: "token" });
    if (token) currentUserId.current = getUserIdFromToken(token);
  }, []);

  // Load conversation history
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);

    ChatService.getConversation(conversationId)
      .then((res) => {
        if (res.data?.success) {
          const conv = res.data.conversation;
          setMessages(conv.messages ?? []);
          const other = conv.participants?.find(
            (p: Participant) => p.userId !== currentUserId.current,
          );
          setOpponent(other ?? null);
        } else {
          router.push("/chat");
        }
      })
      .catch(() => router.push("/chat"))
      .finally(() => setLoading(false));

    // Mark as read
    ChatService.markAsRead(conversationId).catch(() => {});
  }, [conversationId]);

  // Socket: join room and listen for messages
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit("joinroom", { room_id: conversationId });

    const handleMessage = (payload: { from: string; data: Message }) => {
      // Skip own messages — backend excludes sender; extra guard for edge cases
      if (payload.from === currentUserId.current) return;
      setMessages((prev) => [...prev, payload.data]);
    };

    const handleTyping = () => setIsTyping(true);
    const handleStopTyping = () => setIsTyping(false);

    socket.on("message", handleMessage);
    socket.on("userTyping", handleTyping);
    socket.on("userStoppedTyping", handleStopTyping);

    return () => {
      socket.off("message", handleMessage);
      socket.off("userTyping", handleTyping);
      socket.off("userStoppedTyping", handleStopTyping);
    };
  }, [socket, conversationId]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const emitTyping = useCallback(() => {
    if (!socket || !opponent) return;
    socket.emit("typing", { to: opponent.userId, data: {} });
    if (typingTimeout) clearTimeout(typingTimeout);
    const t = setTimeout(() => {
      socket.emit("stopTyping", { to: opponent.userId, data: {} });
    }, 2000);
    setTypingTimeout(t);
  }, [socket, opponent, typingTimeout]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText("");
    setSending(true);
    try {
      const res = await ChatService.sendMessage(conversationId, content);
      if (res.data?.success) {
        setMessages((prev) => [...prev, res.data.data]);
      }
    } catch {
      // silent
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const groupMessages = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    msgs.forEach((msg) => {
      const date = dayjs(msg.createdAt).format("MMMM D, YYYY");
      const last = groups[groups.length - 1];
      if (last && last.date === date) {
        last.messages.push(msg);
      } else {
        groups.push({ date, messages: [msg] });
      }
    });
    return groups;
  };

  const opponentName = opponent?.name ?? "Conversation";
  const opponentInitial = opponentName[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 88px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <Link
          href="/chat"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        {opponent?.avatar_url ? (
          <Image
            src={opponent.avatar_url}
            alt={opponentName}
            width={38}
            height={38}
            className="w-9.5 h-9.5 rounded-full object-cover flex-shrink-0"
            unoptimized
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {opponentInitial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
            {opponentName}
          </p>
          {isTyping && (
            <p className="text-xs text-primary animate-pulse">typing...</p>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-gray-50 dark:bg-gray-900">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Send className="w-7 h-7 text-primary" />
            </div>
            <p className="text-gray-400 text-sm">
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          groupMessages(messages).map((group) => (
            <div key={group.date}>
              {/* Date divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 flex-shrink-0">
                  {group.date}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>

              {group.messages.map((msg, i) => {
                const isMine = msg.sender?.id === currentUserId.current;
                const showAvatar =
                  !isMine &&
                  (i === 0 ||
                    group.messages[i - 1]?.sender?.id !== msg.sender?.id);

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-end gap-2 mb-1",
                      isMine ? "justify-end" : "justify-start",
                    )}
                  >
                    {/* Opponent avatar spacer / avatar */}
                    {!isMine && (
                      <div className="w-7 flex-shrink-0">
                        {showAvatar ? (
                          opponent?.avatar_url ? (
                            <Image
                              src={opponent.avatar_url}
                              alt={opponentName}
                              width={28}
                              height={28}
                              className="w-7 h-7 rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
                              {opponentInitial}
                            </div>
                          )
                        ) : null}
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[70%] flex flex-col gap-1",
                        isMine ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words",
                          isMine
                            ? "gradient-bg text-white rounded-br-sm"
                            : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm rounded-bl-sm",
                        )}
                      >
                        {msg.text}
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-[10px] text-gray-400",
                          isMine ? "flex-row" : "flex-row-reverse",
                        )}
                      >
                        <span>{dayjs(msg.createdAt).format("h:mm A")}</span>
                        {isMine && <StatusIcon status={msg.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              emitTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-32 overflow-y-auto leading-relaxed"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="p-2.5 gradient-bg text-white rounded-2xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
