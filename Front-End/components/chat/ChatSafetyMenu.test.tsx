import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatSafetyMenu, { ReportMessageButton } from "./ChatSafetyMenu";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/chat/chat.service", () => ({
  ...jest.requireActual("@/service/chat/chat.service"),
  ChatService: { block: jest.fn(), unblock: jest.fn(), report: jest.fn() },
}));

import { ChatService } from "@/service/chat/chat.service";
import { toast } from "react-toastify";

const person = { id: "u2", name: "Bad Actor" };

beforeEach(() => {
  (ChatService.block as jest.Mock).mockResolvedValue({ data: { success: true } });
  (ChatService.unblock as jest.Mock).mockResolvedValue({ data: { success: true } });
  (ChatService.report as jest.Mock).mockResolvedValue({ data: { success: true } });
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ChatSafetyMenu", () => {
  it("blocks after confirming", async () => {
    const user = userEvent.setup();
    const onBlockedChange = jest.fn();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe={false} onBlockedChange={onBlockedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: /block/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Block Bad Actor\?.*Bookings and contracts aren't affected/));
    await waitFor(() => expect(ChatService.block).toHaveBeenCalledWith("u2"));
    expect(onBlockedChange).toHaveBeenCalledWith(true);
  });

  it("does nothing if the block isn't confirmed", async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    const user = userEvent.setup();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe={false} onBlockedChange={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: /block/i }));
    expect(ChatService.block).not.toHaveBeenCalled();
  });

  it("offers Unblock when already blocked", async () => {
    const user = userEvent.setup();
    const onBlockedChange = jest.fn();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe onBlockedChange={onBlockedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: "Unblock" }));
    await waitFor(() => expect(ChatService.unblock).toHaveBeenCalledWith("u2"));
    expect(onBlockedChange).toHaveBeenCalledWith(false);
  });

  it("reports with a reason, details and an optional block", async () => {
    const user = userEvent.setup();
    const onBlockedChange = jest.fn();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe={false} onBlockedChange={onBlockedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: /report/i }));

    const dialog = screen.getByRole("dialog", { name: "Report Bad Actor" });
    expect(screen.getByRole("button", { name: /send report/i })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Scam or fraud" }));
    await user.type(screen.getByLabelText("Details (optional)"), "Asked me to pay by Zelle");
    expect(screen.getByRole("checkbox", { name: /also block bad actor/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /send report/i }));

    await waitFor(() =>
      expect(ChatService.report).toHaveBeenCalledWith({ reported_id: "u2", reason: "scam", details: "Asked me to pay by Zelle", conversation_id: "c1", message_id: undefined, block: true }),
    );
    expect(onBlockedChange).toHaveBeenCalledWith(true);
    expect(toast.success).toHaveBeenCalled();
    expect(dialog).not.toBeInTheDocument();
  });

  it("can report without blocking", async () => {
    const user = userEvent.setup();
    const onBlockedChange = jest.fn();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe={false} onBlockedChange={onBlockedChange} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: /report/i }));
    await user.click(screen.getByRole("radio", { name: "Spam" }));
    await user.click(screen.getByRole("checkbox", { name: /also block/i }));
    await user.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(ChatService.report).toHaveBeenCalledWith(expect.objectContaining({ reason: "spam", block: undefined, details: undefined })));
    expect(onBlockedChange).not.toHaveBeenCalled();
  });

  it("shows the server's message when the report fails", async () => {
    (ChatService.report as jest.Mock).mockRejectedValue({ response: { data: { message: "ThrottlerException: Too Many Requests" } } });
    const user = userEvent.setup();
    render(<ChatSafetyMenu person={person} conversationId="c1" blockedByMe onBlockedChange={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: "Chat options" }));
    await user.click(screen.getByRole("menuitem", { name: /report/i }));
    expect(screen.queryByRole("checkbox")).toBeNull(); // already blocked
    await user.click(screen.getByRole("radio", { name: "Harassment or bullying" }));
    await user.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("ThrottlerException: Too Many Requests"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ReportMessageButton", () => {
  it("reports one message from the keyboard, with its id", async () => {
    const user = userEvent.setup();
    const onReported = jest.fn();
    render(<ReportMessageButton person={person} conversationId="g1" messageId="m9" onReported={onReported} />);
    // keyboard: tab to the flag and press Enter
    await user.tab();
    expect(screen.getByRole("button", { name: "Report message from Bad Actor" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Report message" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Spam" }));
    await user.click(screen.getByRole("checkbox", { name: /also block/i }));
    await user.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() =>
      expect(ChatService.report).toHaveBeenCalledWith({ reported_id: "u2", reason: "spam", details: undefined, conversation_id: "g1", message_id: "m9", block: undefined }),
    );
    expect(onReported).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
