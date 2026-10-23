import React from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import TypingIndicator from "./TypingIndicator";
import { createTypingEmitter, readReceipt, typingLabel, useTypingUsers, TYPING_EXPIRE_MS } from "./presence";
import type { ChatMessage } from "@/service/chat/chat.service";

const msg = (id: string, senderId: string, createdAt: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  text: "hi",
  kind: "text",
  createdAt,
  sender: { id: senderId, name: senderId === "me" ? "Me Myself" : "Ana Lopez" },
  ...over,
});

/** Minimal socket stand-in: keeps handlers so a test can fire server events. */
function fakeSocket() {
  const handlers: Record<string, ((e: any) => void)[]> = {};
  return {
    on: (ev: string, cb: (e: any) => void) => ((handlers[ev] ??= []).push(cb)),
    off: (ev: string, cb: (e: any) => void) => (handlers[ev] = (handlers[ev] ?? []).filter((h) => h !== cb)),
    fire: (ev: string, e: any) => (handlers[ev] ?? []).forEach((h) => h(e)),
  };
}

describe("readReceipt", () => {
  const messages = [msg("m1", "me", "2026-10-23T10:00:00.000Z"), msg("m2", "ana", "2026-10-23T10:01:00.000Z"), msg("m3", "me", "2026-10-23T10:02:00.000Z")];

  it("says Sent under my latest message until the other person has read past it", () => {
    const others = [{ id: "ana", name: "Ana Lopez", last_read_at: "2026-10-23T10:01:30.000Z" }];
    expect(readReceipt(messages, others, false, "me")).toEqual({ id: "m3", label: "Sent" });
  });

  it("says Seen once they have", () => {
    const others = [{ id: "ana", name: "Ana Lopez", last_read_at: "2026-10-23T10:05:00.000Z" }];
    expect(readReceipt(messages, others, false, "me")).toEqual({ id: "m3", label: "Seen" });
  });

  it("names who has seen it in a group", () => {
    const others = [
      { id: "ana", name: "Ana Lopez", last_read_at: "2026-10-23T10:05:00.000Z" },
      { id: "bo", name: "Bo Kim", last_read_at: null },
    ];
    expect(readReceipt(messages, others, true, "me")?.label).toBe("Seen by Ana");
    expect(readReceipt(messages, others.map((o) => ({ ...o, last_read_at: "2026-10-23T11:00:00.000Z" })), true, "me")?.label).toBe("Seen by everyone");
  });

  it("shows nothing when I haven't sent anything", () => {
    expect(readReceipt([messages[1]], [], false, "me")).toBeNull();
  });
});

describe("createTypingEmitter", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("sends typing at most every 2 s while keys keep coming", () => {
    const send = jest.fn();
    const t = createTypingEmitter(send);
    t.input();
    t.input();
    jest.advanceTimersByTime(1000);
    t.input();
    expect(send.mock.calls).toEqual([[true]]);
    jest.advanceTimersByTime(1000);
    t.input();
    expect(send.mock.calls).toEqual([[true], [true]]);
  });

  it("sends stop after 4 s idle, and only once", () => {
    const send = jest.fn();
    const t = createTypingEmitter(send);
    t.input();
    jest.advanceTimersByTime(3999);
    expect(send).toHaveBeenLastCalledWith(true);
    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenLastCalledWith(false);
    t.stop();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops straight away on send", () => {
    const send = jest.fn();
    const t = createTypingEmitter(send);
    t.input();
    t.stop();
    expect(send.mock.calls).toEqual([[true], [false]]);
    jest.advanceTimersByTime(10_000);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("useTypingUsers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = () => {
    const socket = fakeSocket();
    const hook = renderHook(() => useTypingUsers(socket as unknown as Socket, "c1", "me"));
    return { socket, hook };
  };

  it("shows who is typing in this chat only, and hides after 5 s without an update", () => {
    const { socket, hook } = setup();
    act(() => socket.fire("userTyping", { conversation_id: "other", user_id: "bo", name: "Bo" }));
    act(() => socket.fire("userTyping", { conversation_id: "c1", user_id: "me", name: "Me" }));
    expect(hook.result.current).toEqual([]);

    act(() => socket.fire("userTyping", { conversation_id: "c1", user_id: "ana", name: "Ana Lopez" }));
    expect(hook.result.current).toEqual(["Ana Lopez"]);

    act(() => jest.advanceTimersByTime(TYPING_EXPIRE_MS - 1000));
    act(() => socket.fire("userTyping", { conversation_id: "c1", user_id: "ana", name: "Ana Lopez" }));
    act(() => jest.advanceTimersByTime(TYPING_EXPIRE_MS - 1000));
    expect(hook.result.current).toEqual(["Ana Lopez"]);
    act(() => jest.advanceTimersByTime(1000));
    expect(hook.result.current).toEqual([]);
  });

  it("hides on stop or when their message arrives", () => {
    const { socket, hook } = setup();
    act(() => socket.fire("userTyping", { conversation_id: "c1", user_id: "ana", name: "Ana" }));
    act(() => socket.fire("userStoppedTyping", { conversation_id: "c1", user_id: "ana" }));
    expect(hook.result.current).toEqual([]);

    act(() => socket.fire("userTyping", { conversation_id: "c1", user_id: "ana", name: "Ana" }));
    act(() => socket.fire("message", { data: msg("m9", "ana", "2026-10-23T10:00:00.000Z", { conversation_id: "c1" }) }));
    expect(hook.result.current).toEqual([]);
  });
});

describe("TypingIndicator", () => {
  it("reads '<Name> is typing…'", () => {
    const { rerender } = render(<TypingIndicator names={["Ana Lopez"]} />);
    expect(screen.getByText("Ana is typing…")).toBeInTheDocument();
    rerender(<TypingIndicator names={[]} />);
    expect(screen.queryByText(/typing/)).toBeNull();
  });

  it("handles several people", () => {
    expect(typingLabel(["Ana", "Bo"])).toBe("Ana and Bo are typing…");
    expect(typingLabel(["Ana", "Bo", "Cy"])).toBe("Several people are typing…");
  });
});
