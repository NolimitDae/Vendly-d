import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArchivedChatList, { ArchivedLink, CHAT_ARCHIVE_EVENT, setChatArchived } from "./ArchivedChats";
import ChatSafetyMenu from "./ChatSafetyMenu";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/chat/chat.service", () => ({
  ...jest.requireActual("@/service/chat/chat.service"),
  ChatService: { archive: jest.fn(), unarchive: jest.fn(), block: jest.fn(), unblock: jest.fn(), report: jest.fn() },
}));

import { ChatService } from "@/service/chat/chat.service";
import { toast } from "react-toastify";

const chats = [
  { conversation_id: "c1", opponent: { name: "Bloom Florals" }, lastMessage: { text: "Thanks again!", createdAt: "2026-10-01T10:00:00Z" } },
  { conversation_id: "c2", is_group: true, title: "Ada & Tobi Wedding", opponent: null, lastMessage: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  (ChatService.archive as jest.Mock).mockResolvedValue({ data: { success: true } });
  (ChatService.unarchive as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe("ArchivedLink", () => {
  it('shows "Archived (n)" and opens the archived list', async () => {
    const onOpen = jest.fn();
    render(<ArchivedLink count={3} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Archived chats, 3" }));
    expect(screen.getByText("Archived (3)")).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
  });

  it("is hidden when nothing is archived", () => {
    const { container } = render(<ArchivedLink count={0} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ArchivedChatList", () => {
  it("lists archived chats, each with Unarchive", async () => {
    const onUnarchived = jest.fn();
    const heard = jest.fn();
    window.addEventListener(CHAT_ARCHIVE_EVENT, heard);
    render(<ArchivedChatList conversations={chats} loading={false} onBack={() => {}} onUnarchived={onUnarchived} />);

    expect(screen.getByRole("region", { name: "Archived chats" })).toBeInTheDocument();
    expect(screen.getByText("Thanks again!")).toBeInTheDocument();
    expect(screen.getByText("Ada & Tobi Wedding")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Unarchive chat with Bloom Florals" }));
    await waitFor(() => expect(onUnarchived).toHaveBeenCalledWith("c1"));
    expect(ChatService.unarchive).toHaveBeenCalledWith("c1");
    // the sidebar hears about it and refreshes its list
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ conversation_id: "c1", archived: false });
    window.removeEventListener(CHAT_ARCHIVE_EVENT, heard);
  });

  it("says when there are none, and goes back to all chats", async () => {
    const onBack = jest.fn();
    render(<ArchivedChatList conversations={[]} loading={false} onBack={onBack} />);
    expect(screen.getByText("No archived chats.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to all chats" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("archiving", () => {
  it("shows the server's reason when a chat can't be archived yet", async () => {
    (ChatService.archive as jest.Mock).mockRejectedValue({ response: { status: 400, data: { message: "You can archive this chat once your booking with Bloom Florals is finished." } } });
    expect(await setChatArchived("c1", true)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("You can archive this chat once your booking with Bloom Florals is finished.");
  });

  it("the chat menu archives and unarchives", async () => {
    const user = userEvent.setup();
    const onArchivedChange = jest.fn();
    const { rerender } = render(<ChatSafetyMenu conversationId="c1" archived={false} onArchivedChange={onArchivedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    // an event group chat: no block or report, just archive
    expect(screen.queryByRole("menuitem", { name: /block/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Archive chat" }));
    await waitFor(() => expect(onArchivedChange).toHaveBeenCalledWith(true));
    expect(ChatService.archive).toHaveBeenCalledWith("c1");

    rerender(<ChatSafetyMenu person={{ id: "u2", name: "Bloom Florals" }} conversationId="c1" blockedByMe={false} onBlockedChange={() => {}} archived onArchivedChange={onArchivedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    expect(screen.getByRole("menuitem", { name: /^block/i })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Unarchive chat" }));
    await waitFor(() => expect(onArchivedChange).toHaveBeenCalledWith(false));
  });
});
