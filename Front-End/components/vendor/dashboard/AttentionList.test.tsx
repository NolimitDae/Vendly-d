import React from "react";
import { render, screen, within } from "@testing-library/react";
import AttentionList, { attentionRow, timeLeft } from "./AttentionList";
import type { AttentionItem } from "@/service/vendor/vendor-dashboard.service";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = new Date("2026-11-10T12:00:00Z");
const HOUR = 3600e3;
const later = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();
const item = (over: Partial<AttentionItem>): AttentionItem => ({ kind: "request", booking_id: "b1", title: "Party DJ", customer_name: "Ana Lee", at: null, ...over });

describe("timeLeft", () => {
  it("reads in days and hours", () => {
    expect(timeLeft(later(0.5), NOW)).toBe("less than an hour");
    expect(timeLeft(later(1), NOW)).toBe("1 hour");
    expect(timeLeft(later(5), NOW)).toBe("5 hours");
    expect(timeLeft(later(24), NOW)).toBe("1 day");
    expect(timeLeft(later(62), NOW)).toBe("2 days 14 hours");
  });
});

describe("AttentionList", () => {
  it("shows an empty state when nothing needs doing", () => {
    render(<AttentionList items={[]} now={NOW} />);
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeInTheDocument();
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists each thing with a button to the right page", () => {
    render(
      <AttentionList
        now={NOW}
        items={[
          item({ at: later(62) }),
          item({ kind: "changes_approved", booking_id: "b2", at: later(5) }),
          item({ kind: "payment", booking_id: "b3", detail: "deposit", at: later(6) }),
          item({ kind: "dispute", booking_id: "b4", detail: "no_show" }),
          item({ kind: "rental_return", booking_id: "b5", title: "Gold chairs", at: "2026-11-08T00:00:00Z" }),
          item({ kind: "extra_waiting", booking_id: "b6", detail: "Travel fee", amount: 30, at: later(-24) }),
          item({ kind: "unread_chats", booking_id: null, title: null, customer_name: null, chats: 2, messages: 3 }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(screen.getByText("7")).toBeInTheDocument();

    expect(within(rows[0]).getByText("Booking request from Ana Lee")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Closes in 2 days 14 hours/)).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "Review request: Booking request from Ana Lee" })).toHaveAttribute("href", "/vendor/bookings/b1");

    expect(within(rows[1]).getByRole("link", { name: /^Accept booking/ })).toHaveAttribute("href", "/vendor/bookings/b2");
    expect(within(rows[2]).getByText("Ana Lee's deposit didn't go through")).toBeInTheDocument();
    expect(within(rows[3]).getByRole("link", { name: /^Reply/ })).toHaveAttribute("href", "/vendor/bookings/b4");
    expect(within(rows[4]).getByRole("link", { name: "Check in: Check in Gold chairs" })).toHaveAttribute("href", "/vendor/bookings/b5");
    expect(within(rows[5]).getByText("Travel fee ($30.00) is waiting for Ana Lee")).toBeInTheDocument();
    expect(within(rows[6]).getByText("3 unread messages")).toBeInTheDocument();
    expect(within(rows[6]).getByRole("link", { name: /^Open messages/ })).toHaveAttribute("href", "/chat");
  });

  it("marks requests closing within 12 hours as urgent", () => {
    expect(attentionRow(item({ at: later(5) }), NOW).urgent).toBe(true);
    expect(attentionRow(item({ at: later(30) }), NOW).urgent).toBe(false);
  });

  it("says when a complaint already has a reply, and when a failed charge is being retried", () => {
    expect(attentionRow(item({ kind: "dispute", done: true }), NOW)).toMatchObject({ action: "View complaint", body: expect.stringContaining("You replied") });
    expect(attentionRow(item({ kind: "payment", detail: "Late fee", amount: 40, done: true }), NOW).body).toBe("Party DJ: $40.00 for Late fee. We'll try the card again.");
  });

  it("shows placeholders while loading", () => {
    render(<AttentionList items={[]} loading now={NOW} />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
  });
});
