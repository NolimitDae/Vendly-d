"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { ChatMessage, ConversationInfo } from "@/service/chat/chat.service";

/** How often a typer re-sends "typing", when they count as idle, and how long a silent indicator lasts. */
export const TYPING_THROTTLE_MS = 2000;
export const TYPING_IDLE_MS = 4000;
export const TYPING_EXPIRE_MS = 5000;

/** Window event the open chat fires once it has marked itself read, so the sidebar can clear its badge. */
export const CHAT_READ_EVENT = "vendly:chat-read";

type Participant = ConversationInfo["participants"][number];

/** "Sent" / "Seen" (or who has seen it, in a group) under my latest message. */
export function readReceipt(messages: ChatMessage[], others: Participant[], isGroup: boolean, meId: string | null) {
  const mine = [...messages].reverse().find((m) => m.sender?.id === meId && m.kind !== "system");
  if (!mine) return null;
  const sentAt = new Date(mine.createdAt).getTime();
  const readers = others.filter((p) => p.last_read_at && new Date(p.last_read_at).getTime() >= sentAt);
  if (!readers.length) return { id: mine.id, label: "Sent" };
  if (!isGroup) return { id: mine.id, label: "Seen" };
  return { id: mine.id, label: readers.length === others.length ? "Seen by everyone" : `Seen by ${readers.map((r) => r.name.split(" ")[0]).join(", ")}` };
}

/**
 * Turns keystrokes into throttled typing events: "typing" at most every `throttleMs` while keys keep
 * coming, then "stopped" after `idleMs` without one (or straight away on stop(), e.g. when sending).
 */
export function createTypingEmitter(send: (typing: boolean) => void, { throttleMs = TYPING_THROTTLE_MS, idleMs = TYPING_IDLE_MS } = {}) {
  let lastSent = 0;
  let active = false;
  let idle: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (idle) clearTimeout(idle);
    idle = null;
    if (active) send(false);
    active = false;
    lastSent = 0;
  };

  const input = () => {
    const now = Date.now();
    if (!active || now - lastSent >= throttleMs) {
      send(true);
      active = true;
      lastSent = now;
    }
    if (idle) clearTimeout(idle);
    idle = setTimeout(stop, idleMs);
  };

  return { input, stop };
}

export function typingLabel(names: string[]) {
  const first = names.map((n) => n.split(" ")[0] || "Someone");
  if (!first.length) return null;
  if (first.length === 1) return `${first[0]} is typing…`;
  if (first.length === 2) return `${first[0]} and ${first[1]} are typing…`;
  return "Several people are typing…";
}

/**
 * Who else is typing in this conversation, from the socket's userTyping / userStoppedTyping events.
 * Someone drops off after TYPING_EXPIRE_MS without an update, or as soon as their message lands.
 */
export function useTypingUsers(socket: Socket | null, conversationId: string, meId: string | null) {
  const [typers, setTypers] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!socket || !conversationId) return;
    const pending = timers.current;
    const drop = (userId: string) => {
      clearTimeout(pending[userId]);
      delete pending[userId];
      setTypers((t) => {
        if (!(userId in t)) return t;
        const { [userId]: _gone, ...rest } = t;
        return rest;
      });
    };
    const onTyping = (e: { conversation_id: string; user_id: string; name?: string }) => {
      if (e?.conversation_id !== conversationId || !e.user_id || e.user_id === meId) return;
      setTypers((t) => (t[e.user_id] === (e.name ?? "Someone") ? t : { ...t, [e.user_id]: e.name ?? "Someone" }));
      clearTimeout(pending[e.user_id]);
      pending[e.user_id] = setTimeout(() => drop(e.user_id), TYPING_EXPIRE_MS);
    };
    const onStopped = (e: { conversation_id: string; user_id: string }) => {
      if (e?.conversation_id === conversationId && e.user_id) drop(e.user_id);
    };
    const onMessage = (e: { data?: ChatMessage }) => {
      const m = e?.data;
      if (m?.sender?.id && (!m.conversation_id || m.conversation_id === conversationId)) drop(m.sender.id);
    };

    socket.on("userTyping", onTyping);
    socket.on("userStoppedTyping", onStopped);
    socket.on("message", onMessage);
    return () => {
      socket.off("userTyping", onTyping);
      socket.off("userStoppedTyping", onStopped);
      socket.off("message", onMessage);
      Object.values(pending).forEach(clearTimeout);
      timers.current = {};
      setTypers({});
    };
  }, [socket, conversationId, meId]);

  return Object.values(typers);
}
