import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InboxTabs from "./InboxTabs";
import SendLimitNote, { sendLimitReached } from "./SendLimitNote";
import type { InboxCounts, SendLimit } from "@/service/chat/chat.service";

const counts: InboxCounts = {
  clients: { total: 4, unread: 2, unread_messages: 5 },
  inquiries: { total: 9, unread: 0, unread_messages: 0 },
};

describe("InboxTabs", () => {
  it("shows Clients and Inquiries, each with its unread chats", () => {
    render(<InboxTabs tab="clients" counts={counts} onChange={() => {}} />);
    const clients = screen.getByRole("tab", { name: /Clients/ });
    expect(clients).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("2 unread")).toBeInTheDocument();
    // nothing unread: no badge
    expect(screen.getByRole("tab", { name: "Inquiries" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches tab", async () => {
    const onChange = jest.fn();
    render(<InboxTabs tab="clients" counts={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Inquiries" }));
    expect(onChange).toHaveBeenCalledWith("inquiries");
  });
});

describe("SendLimitNote", () => {
  const limit = (used: number): SendLimit => ({ limit: 3, used, remaining: 3 - used, vendor_name: "Bloom Florals" });

  it("says nothing before the first message or when there's no limit", () => {
    const { container, rerender } = render(<SendLimitNote limit={limit(0)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SendLimitNote limit={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts down quietly after the first message", () => {
    const { rerender } = render(<SendLimitNote limit={limit(1)} />);
    expect(screen.getByText("2 messages left until they reply")).toBeInTheDocument();
    rerender(<SendLimitNote limit={limit(2)} />);
    expect(screen.getByText("1 message left until they reply")).toBeInTheDocument();
  });

  it("explains the wait once all 3 are used", () => {
    render(<SendLimitNote limit={limit(3)} />);
    expect(screen.getByRole("status")).toHaveTextContent("You've sent 3 messages. You can send more once Bloom Florals replies.");
    expect(sendLimitReached(limit(3))).toBe(true);
    expect(sendLimitReached(limit(2))).toBe(false);
    expect(sendLimitReached(null)).toBe(false);
  });
});
