"use client";

import { whoAmI } from "@/lib/currentUser";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Ban, ImagePlus, Send, Loader2, Pin, PinOff, ShieldCheck, Tags, Users, X } from "lucide-react";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { acceptPhotos, ChatService, CONTACT_WARNING, MAX_PHOTOS, sharesContact, type ChatMessage, type ConversationInfo, type Quote } from "@/service/chat/chat.service";
import { errorMessage } from "@/service/rentals/rentals.service";
import { useSocket } from "@/hooks/useSocket";
import QuoteCard from "@/components/chat/QuoteCard";
import SendQuoteModal from "@/components/chat/SendQuoteModal";
import TypingIndicator from "@/components/chat/TypingIndicator";
import SendLimitNote, { sendLimitReached } from "@/components/chat/SendLimitNote";
import ChatSafetyMenu, { ReportMessageButton } from "@/components/chat/ChatSafetyMenu";
import { CHAT_READ_EVENT, createTypingEmitter, readReceipt, useTypingUsers } from "@/components/chat/presence";
import { cn } from "@/lib/utils";

function Avatar({ url, name, size = 28 }: { url?: string | null; name: string; size?: number }) {
  return url ? (
    <Image src={url} alt={name} width={size} height={size} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} unoptimized />
  ) : (
    <div className="rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const socket = useSocket();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);
  // up to 10 photos per message, previewed before sending
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const fileRef = useRef<HTMLInputElement>(null);
  // a message arrived while the tab was hidden; mark it read once the tab is visible again
  const unseen = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [me, setMe] = useState<{ id: string | null; type: string | null }>({ id: null, type: null });

  useEffect(() => {
    // the login token is in an HttpOnly cookie, so who we are comes from the API
    whoAmI().then(setMe);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await ChatService.getMessages(conversationId);
      if (res.data?.success) {
        // an empty chat comes back as a nested page object rather than an array
        const list = res.data.data;
        setMessages(Array.isArray(list) ? list : list?.data ?? []);
        setInfo(res.data.conversation ?? null);
      } else {
        router.push("/chat");
      }
    } catch {
      router.push("/chat");
    } finally {
      setLoading(false);
    }
  }, [conversationId, router]);

  // Only counts as read while someone can see it: a background tab waits until it's visible.
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") {
      unseen.current = true;
      return;
    }
    unseen.current = false;
    ChatService.markAsRead(conversationId)
      .then(() => window.dispatchEvent(new CustomEvent(CHAT_READ_EVENT, { detail: { conversation_id: conversationId } })))
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && unseen.current) markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    load().then(markRead);
  }, [conversationId, load, markRead]);

  // Socket: join room, live messages, read receipts, pins, quote updates
  useEffect(() => {
    if (!socket || !conversationId) return;
    // rooms don't survive a reconnect, so join again each time the socket (re)connects
    const join = () => socket.emit("joinroom", { room_id: conversationId });
    join();

    const handleMessage = (payload: { from: string; data: ChatMessage }) => {
      if (!payload?.data?.id) return;
      // this socket may still be in rooms of chats opened earlier
      if (payload.data.conversation_id && payload.data.conversation_id !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === payload.data.id) ? prev : [...prev, payload.data]));
      if (payload.data.sender?.id !== me.id) markRead();
      // the vendor replied: the customer can send freely again
      if (payload.data.sender?.id !== me.id && payload.data.kind !== "system") setInfo((i) => (i?.send_limit ? { ...i, send_limit: null } : i));
    };
    const handleRead = (e: { conversation_id: string; user_id: string; read_at: string }) => {
      if (e.conversation_id !== conversationId) return;
      setInfo((i) => (i ? { ...i, participants: i.participants.map((p) => (p.id === e.user_id ? { ...p, last_read_at: e.read_at } : p)) } : i));
    };
    const handlePinned = (e: { conversation_id: string; message: ChatMessage | null }) => {
      if (e.conversation_id === conversationId) setInfo((i) => (i ? { ...i, pinned: e.message } : i));
    };
    const handleQuote = (e: { quote_id: string; status: Quote["status"] }) => {
      setMessages((prev) => prev.map((m) => (m.quote?.id === e.quote_id ? { ...m, quote: { ...m.quote, status: e.status } } : m)));
    };

    socket.on("connect", join);
    socket.on("message", handleMessage);
    socket.on("conversationRead", handleRead);
    socket.on("pinned", handlePinned);
    socket.on("quoteUpdated", handleQuote);
    return () => {
      // left the chat: new messages here are pushed and added to the inbox again
      socket.emit("leaveroom", { room_id: conversationId });
      socket.off("connect", join);
      socket.off("message", handleMessage);
      socket.off("conversationRead", handleRead);
      socket.off("pinned", handlePinned);
      socket.off("quoteUpdated", handleQuote);
    };
  }, [socket, conversationId, me.id, markRead]);

  // Typing indicator: who else is typing, and throttled typing / stopTyping events from me
  const typers = useTypingUsers(socket, conversationId, me.id);
  const typing = useMemo(
    () => (socket && conversationId ? createTypingEmitter((on) => socket.emit(on ? "typing" : "stopTyping", { conversation_id: conversationId })) : null),
    [socket, conversationId],
  );
  useEffect(() => () => typing?.stop(), [typing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isGroup = !!info?.is_group;
  const others = useMemo(() => (info?.participants ?? []).filter((p) => p.id !== me.id), [info, me.id]);
  const opponent = !isGroup ? others[0] : undefined;
  const title = isGroup ? info?.title ?? "Event chat" : opponent?.name ?? "Conversation";
  // 1:1 only: while either person has blocked the other nobody can send
  const blockedByMe = !isGroup && !!info?.blocked_by_me;
  const blocked = blockedByMe || (!isGroup && !!info?.blocked_me);
  // customers: a few messages until the vendor replies (the server enforces it too)
  const sendLimit = isGroup ? null : info?.send_limit ?? null;
  const limitReached = sendLimitReached(sendLimit);
  const cantSend = blocked || limitReached;

  // previews are freed when a photo is removed, the photos are sent, or the page goes away
  const clearPhotos = useCallback(() => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    if (fileRef.current) fileRef.current.value = "";
  }, []);
  const removePhoto = (url: string) => {
    URL.revokeObjectURL(url);
    setPhotos((prev) => prev.filter((p) => p.url !== url));
  };
  // photos picked in one chat aren't carried into the next
  useEffect(() => clearPhotos, [conversationId, clearPhotos]);

  const pickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    const { files, error } = acceptPhotos(photosRef.current.length, picked);
    if (error) toast.error(error);
    if (files.length) setPhotos((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const send = async () => {
    const content = text.trim();
    if ((!content && !photos.length) || sending || cantSend) return;
    if (content && sharesContact(content) && !confirm(`${CONTACT_WARNING}\n\nSend anyway?`)) return;
    typing?.stop();
    setText("");
    setSending(true);
    try {
      const res = await ChatService.sendMessage(conversationId, content, photos.length ? photos.map((p) => p.file) : undefined);
      if (res.data?.success) {
        setMessages((prev) => (prev.some((m) => m.id === res.data.data.id) ? prev : [...prev, res.data.data]));
        setWarning(res.data.warning?.text ?? null);
        setInfo((i) => (i ? { ...i, send_limit: res.data.send_limit ?? null } : i));
        clearPhotos();
      }
    } catch (e) {
      setText(content);
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(errorMessage(e, "Message not sent"));
      // blocked since the chat was opened: refresh so the notice shows
      if (status === 403) load();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const pin = async (m: ChatMessage | null) => {
    try {
      await ChatService.pin(conversationId, m?.id ?? null);
      setInfo((i) => (i ? { ...i, pinned: m } : i));
    } catch (e) {
      toast.error(errorMessage(e, "Could not pin"));
    }
  };

  const acceptQuote = (q: Quote) => {
    if (!q.listing) return;
    router.push(`/marketplace/${q.listing.id}?quote=${q.id}`);
  };
  const quoteAction = async (q: Quote, action: "decline" | "withdraw") => {
    setBusyQuote(q.id);
    try {
      await (action === "decline" ? ChatService.declineQuote(q.id) : ChatService.withdrawQuote(q.id));
      setMessages((prev) => prev.map((m) => (m.quote?.id === q.id ? { ...m, quote: { ...q, status: action === "decline" ? "DECLINED" : "WITHDRAWN" } } : m)));
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the quote"));
    } finally {
      setBusyQuote(null);
    }
  };

  // read receipt under my latest message
  const receipt = useMemo(() => readReceipt(messages, others, isGroup, me.id), [messages, others, isGroup, me.id]);

  const groups = useMemo(() => {
    const out: { date: string; messages: ChatMessage[] }[] = [];
    messages.forEach((msg) => {
      const date = dayjs(msg.createdAt).format("MMMM D, YYYY");
      const last = out[out.length - 1];
      if (last && last.date === date) last.messages.push(msg);
      else out.push({ date, messages: [msg] });
    });
    return out;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <Link href="/chat" className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400" aria-label="Back to conversations">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {isGroup ? (
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0"><Users className="w-4.5 h-4.5" /></div>
        ) : (
          <Avatar url={opponent?.avatar_url} name={title} size={38} />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{title}</p>
          {isGroup ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{info?.participants.map((p) => (p.id === me.id ? "You" : p.name)).join(", ")}</p>
          ) : null}
        </div>
        {me.type === "VENDOR" && !blocked && (
          <button onClick={() => setQuoting(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 text-primary text-sm font-medium hover:bg-primary/5">
            <Tags className="w-4 h-4" /> Send quote
          </button>
        )}
        {!isGroup && opponent && (
          <ChatSafetyMenu
            person={{ id: opponent.id, name: opponent.name }}
            conversationId={conversationId}
            blockedByMe={blockedByMe}
            onBlockedChange={(b) => setInfo((i) => (i ? { ...i, blocked_by_me: b } : i))}
          />
        )}
      </div>

      {info?.pinned && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/10 text-sm">
          <Pin className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-primary">Pinned{info.pinned.sender ? ` · ${info.pinned.sender.name}` : ""}</span>
            <p className="truncate text-gray-700 dark:text-gray-200">{info.pinned.kind === "quote" ? `Quote: ${info.pinned.quote?.title ?? ""}` : info.pinned.text}</p>
          </div>
          <button onClick={() => pin(null)} aria-label="Unpin" className="p-1 rounded hover:bg-primary/10"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-gray-50 dark:bg-gray-900">
        {loading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3"><Send className="w-7 h-7 text-primary" /></div>
            <p className="text-gray-400 text-sm max-w-xs">{isGroup ? "Everyone working on this event can talk here." : "No messages yet. Say hello!"} Keep booking details in Vendly so they’re covered by your contract.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 flex-shrink-0">{group.date}</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
              {group.messages.map((msg, i) => {
                if (msg.kind === "system") {
                  return <p key={msg.id} className="text-center text-xs text-gray-500 dark:text-gray-400 my-3"><span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800">{msg.text}</span></p>;
                }
                const isMine = msg.sender?.id === me.id;
                const name = msg.sender?.name ?? "User";
                const firstOfRun = i === 0 || group.messages[i - 1]?.sender?.id !== msg.sender?.id || group.messages[i - 1]?.kind === "system";
                const isPinned = info?.pinned?.id === msg.id;
                return (
                  <div key={msg.id} className={cn("group flex items-end gap-2 mb-1", isMine ? "justify-end" : "justify-start")}>
                    {!isMine && <div className="w-7 flex-shrink-0">{firstOfRun && <Avatar url={msg.sender?.avatar_url ?? msg.sender?.avatar} name={name} />}</div>}
                    {isMine && (
                      <button onClick={() => pin(isPinned ? null : msg)} aria-label={isPinned ? "Unpin message" : "Pin message"} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-gray-400 hover:text-primary transition">
                        {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <div className={cn("max-w-[75%] flex flex-col gap-1", isMine ? "items-end" : "items-start")}>
                      {isGroup && !isMine && firstOfRun && <span className="text-xs font-semibold text-primary px-1">{name}</span>}
                      {msg.kind === "quote" && msg.quote ? (
                        <QuoteCard
                          quote={msg.quote}
                          role={msg.quote.customer_id === me.id ? "customer" : msg.quote.vendor_id === me.id ? "vendor" : "other"}
                          busy={busyQuote === msg.quote.id}
                          onAccept={() => acceptQuote(msg.quote!)}
                          onDecline={() => quoteAction(msg.quote!, "decline")}
                          onWithdraw={() => quoteAction(msg.quote!, "withdraw")}
                        />
                      ) : (
                        msg.text ? (
                          <div className={cn("px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap", isMine ? "gradient-bg text-white rounded-br-sm" : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm rounded-bl-sm")}>
                            {msg.text}
                          </div>
                        ) : null
                      )}
                      {!!msg.attachments_url?.length && (
                        <div className={cn("grid gap-1", msg.attachments_url.length === 1 ? "grid-cols-1" : msg.attachments_url.length === 2 || msg.attachments_url.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
                          {msg.attachments_url.map((url, n) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Open photo ${n + 1} of ${msg.attachments_url!.length} from ${name}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- user photo from storage */}
                              <img
                                src={url}
                                alt={`Photo ${n + 1} from ${name}`}
                                className={cn("rounded-2xl object-cover bg-gray-100 dark:bg-gray-800", msg.attachments_url!.length === 1 ? "max-w-[240px] max-h-[240px]" : "w-24 h-24 sm:w-28 sm:h-28")}
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        {isPinned && <Pin className="w-3 h-3 text-primary" />}
                        <span>{dayjs(msg.createdAt).format("h:mm A")}</span>
                        {receipt?.id === msg.id && <span>· {receipt.label}</span>}
                      </div>
                    </div>
                    {!isMine && (
                      <button onClick={() => pin(isPinned ? null : msg)} aria-label={isPinned ? "Unpin message" : "Pin message"} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-gray-400 hover:text-primary transition">
                        {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {!isMine && msg.sender && (
                      <ReportMessageButton
                        person={{ id: msg.sender.id, name }}
                        conversationId={conversationId}
                        messageId={msg.id}
                        alreadyBlocked={isGroup ? undefined : blockedByMe}
                        onReported={(alsoBlocked) => alsoBlocked && !isGroup && setInfo((i) => (i ? { ...i, blocked_by_me: true } : i))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
        {!loading && <TypingIndicator names={typers} />}
        <div ref={bottomRef} />
      </div>

      {warning && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs border-t border-amber-100 dark:border-amber-900/40">
          <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{warning}</span>
          <button onClick={() => setWarning(null)} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {blocked && (
        <div role="status" className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm border-t border-gray-200 dark:border-gray-700">
          <Ban className="w-4 h-4 flex-shrink-0" />
          {blockedByMe ? (
            <span>
              You blocked {opponent?.name ?? "this person"} ·{" "}
              <button
                onClick={async () => {
                  if (!opponent) return;
                  try {
                    await ChatService.unblock(opponent.id);
                    setInfo((i) => (i ? { ...i, blocked_by_me: false } : i));
                  } catch (e) {
                    toast.error(errorMessage(e, "Could not unblock"));
                  }
                }}
                className="font-semibold text-primary hover:underline"
              >
                Unblock
              </button>
            </span>
          ) : (
            <span>You can&apos;t reply to this conversation</span>
          )}
        </div>
      )}

      {!blocked && <SendLimitNote limit={sendLimit} />}

      {photos.length > 0 && !blocked && (
        <div className="px-4 pt-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
          <ul aria-label="Photos to send" className="flex gap-3 overflow-x-auto pt-2 pb-1">
            {photos.map((p, n) => (
              <li key={p.url} className="relative flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={p.url} alt={`Photo ${n + 1} to send`} className="w-16 h-16 rounded-xl object-cover" />
                <button onClick={() => removePhoto(p.url)} aria-label={`Remove photo ${n + 1}`} className="absolute -top-2 -right-2 p-0.5 rounded-full bg-gray-900/80 text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">{photos.length} of {MAX_PHOTOS} photos</p>
        </div>
      )}

      {/* Input */}
      <div className={cn("flex-shrink-0 bg-white dark:bg-gray-800 px-4 py-3", !photos.length && !(sendLimit && sendLimit.used > 0) && "border-t border-gray-100 dark:border-gray-700")}>
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickPhotos} aria-label="Choose photos" disabled={cantSend} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={cantSend || sending || photos.length >= MAX_PHOTOS}
            aria-label={`Attach photos (up to ${MAX_PHOTOS})`}
            className="p-2.5 rounded-2xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) typing?.input();
              else typing?.stop();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={blocked ? "You can't send messages in this chat" : limitReached ? `Waiting for ${sendLimit?.vendor_name ?? "them"} to reply` : "Type a message... (Enter to send)"}
            aria-label="Message"
            disabled={cantSend}
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-32 overflow-y-auto leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <button onClick={send} disabled={(!text.trim() && !photos.length) || sending || cantSend} aria-label="Send" className="p-2.5 gradient-bg text-white rounded-2xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {quoting && <SendQuoteModal conversationId={conversationId} onClose={() => setQuoting(false)} onSent={load} />}
    </div>
  );
}
