import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatReportsContent from "./ChatReportsContent";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/admin/chat-reports.service", () => ({ ChatReportsService: { list: jest.fn(), resolve: jest.fn() } }));
jest.mock("@/service/admin/money.service", () => ({ MoneyService: { setUserStatus: jest.fn() } }));

import { ChatReportsService } from "@/service/admin/chat-reports.service";
import { MoneyService } from "@/service/admin/money.service";

const person = (id: string, name: string, status = 1) => ({ id, name, email: `${id}@x.com`, avatar_url: null, status, type: "VENDOR" });
const message = (id: string, text: string, sender: string) => ({ id, text, createdAt: "2026-10-20T10:00:00Z", sender: { id: sender, name: sender }, attachments_url: [] });
const report = {
  id: "r1",
  created_at: "2026-10-20T10:05:00Z",
  reason: "scam",
  details: "Wanted cash outside the app",
  status: "OPEN",
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  reporter: person("cust", "Cara Customer"),
  reported: person("vend", "Victor Vendor"),
  conversation_id: "c1",
  message_id: "m2",
  message: message("m2", "Pay me on Zelle instead", "Victor"),
  context: [message("m1", "Hi, is the 14th free?", "Cara"), message("m2", "Pay me on Zelle instead", "Victor")],
};

beforeEach(() => {
  (ChatReportsService.list as jest.Mock).mockResolvedValue({ data: { data: [report] } });
  (ChatReportsService.resolve as jest.Mock).mockResolvedValue({ data: { success: true } });
  (MoneyService.setUserStatus as jest.Mock).mockResolvedValue({ data: { success: true } });
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ChatReportsContent", () => {
  it("shows the report, the reported message and the conversation", async () => {
    const user = userEvent.setup();
    render(<ChatReportsContent />);
    const card = await screen.findByRole("article", { name: "Report about Victor Vendor" });
    expect(ChatReportsService.list).toHaveBeenCalledWith("open");
    expect(within(card).getByText("Scam or fraud")).toBeInTheDocument();
    expect(within(card).getByText("Cara Customer")).toBeInTheDocument();
    expect(within(card).getByText("Pay me on Zelle instead")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Show conversation (2)" }));
    const convo = within(card).getByRole("list", { name: "Conversation before the report" });
    expect(within(convo).getByText(/is the 14th free/)).toBeInTheDocument();
  });

  it("shows the copy kept with the report when the sender deleted the message", async () => {
    (ChatReportsService.list as jest.Mock).mockResolvedValue({
      data: {
        data: [
          {
            ...report,
            message: null,
            message_deleted: true,
            message_copy: { text: "Send the deposit to my CashApp", attachments: ["a.jpg", "b.jpg"], attachments_url: ["https://cdn/a.jpg", "https://cdn/b.jpg"] },
          },
        ],
      },
    });
    render(<ChatReportsContent />);
    const card = await screen.findByRole("article", { name: "Report about Victor Vendor" });
    expect(within(card).getByText("Deleted by the sender — copy kept for review")).toBeInTheDocument();
    expect(within(card).getByText("Send the deposit to my CashApp")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Attachment 2" })).toHaveAttribute("href", "https://cdn/b.jpg");
  });

  it("says the message is gone when there's no copy (older reports)", async () => {
    (ChatReportsService.list as jest.Mock).mockResolvedValue({ data: { data: [{ ...report, message: null, message_copy: { text: null, attachments: [], attachments_url: [] } }] } });
    render(<ChatReportsContent />);
    expect(await screen.findByText("The sender has deleted this message.")).toBeInTheDocument();
  });

  it("marks a report actioned with a note and removes it from the open list", async () => {
    const user = userEvent.setup();
    render(<ChatReportsContent />);
    await screen.findByRole("article");
    await user.type(screen.getByLabelText("Note"), "Warned the vendor");
    await user.click(screen.getByRole("button", { name: "Mark actioned" }));
    await waitFor(() => expect(ChatReportsService.resolve).toHaveBeenCalledWith("r1", "actioned", "Warned the vendor"));
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
  });

  it("dismisses without a note", async () => {
    const user = userEvent.setup();
    render(<ChatReportsContent />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(ChatReportsService.resolve).toHaveBeenCalledWith("r1", "dismiss", undefined));
  });

  it("suspends the reported user through the account-status endpoint", async () => {
    const user = userEvent.setup();
    render(<ChatReportsContent />);
    await user.click(await screen.findByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(MoneyService.setUserStatus).toHaveBeenCalledWith("vend", 0));
    expect(await screen.findByRole("button", { name: "Restore account" })).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("lists done reports with how they were resolved", async () => {
    (ChatReportsService.list as jest.Mock).mockImplementation((status: string) =>
      Promise.resolve({
        data: { data: status === "done" ? [{ ...report, status: "DISMISSED", resolved_at: "2026-10-21T09:00:00Z", resolved_by: { id: "a", name: "Ada Admin" }, resolution_note: "Not a scam" }] : [] },
      }),
    );
    const user = userEvent.setup();
    render(<ChatReportsContent />);
    expect(await screen.findByText("No open reports.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Dismissed")).toBeInTheDocument();
    expect(screen.getByText(/by Ada Admin/)).toBeInTheDocument();
    expect(screen.getByText("Note: Not a scam")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark actioned" })).toBeNull();
  });
});
