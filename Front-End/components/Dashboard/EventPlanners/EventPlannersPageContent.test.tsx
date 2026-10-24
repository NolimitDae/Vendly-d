import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventPlannersPageContent from "./EventPlannersPageContent";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/admin/admin.service", () => ({ AdminService: { getPlanners: jest.fn(), getPlanner: jest.fn() } }));
jest.mock("@/service/admin/money.service", () => ({ MoneyService: { setUserStatus: jest.fn() } }));

import { AdminService } from "@/service/admin/admin.service";
import { MoneyService } from "@/service/admin/money.service";

const planner = (id: string, business: string, planner_status: string, status = 1) => ({
  id,
  name: `${business} owner`,
  email: `${id}@x.com`,
  avatar: null,
  created_at: "2026-01-10T10:00:00Z",
  status,
  planner_status,
  business_name: business,
  event_types: ["WEDDING"],
  total_events: 3,
  total_bookings: 5,
});

const all = [planner("p1", "Bright Days", "approved"), planner("p2", "Soon Events", "pending"), planner("p3", "Gone Parties", "suspended", 0)];
const counts = { approved: 1, pending: 1, suspended: 1, rejected: 0 };

const detail = {
  id: "p1",
  name: "Bright Days owner",
  email: "p1@x.com",
  phone: null,
  location: "Austin",
  avatar: null,
  created_at: "2026-01-10T10:00:00Z",
  status: 1,
  id_verified: true,
  planner_status: "approved",
  profile: {
    business_name: "Bright Days",
    bio: "Weddings in Texas",
    website: null,
    instagram: null,
    event_types: ["WEDDING"],
    years_experience: 4,
    team_size: 2,
    license_status: "APPROVED",
    approved_at: "2026-01-12T10:00:00Z",
    portfolio: [],
    documents: ["https://cdn.test/event-planner/license/lic.pdf"],
  },
  events: { total: 3, by_status: { PLANNING: 2, COMPLETED: 1 } },
  bookings: { total: 1, recent: [{ id: "b1", status: "CONFIRMED", amount: 250, created_at: "2026-02-01T10:00:00Z", date: null, title: "DJ set", vendor: "Dee Sounds" }] },
  history: [{ at: "2026-01-12T10:00:00Z", event: "approved", note: null, by: null }],
};

beforeEach(() => {
  (AdminService.getPlanners as jest.Mock).mockImplementation(async ({ status }: { status: string }) => ({
    data: { success: true, data: status === "all" ? all : all.filter((p) => p.planner_status === status), counts },
  }));
  (AdminService.getPlanner as jest.Mock).mockResolvedValue({ data: { success: true, data: detail } });
  (MoneyService.setUserStatus as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe("EventPlannersPageContent", () => {
  it("lists every planner and filters by status", async () => {
    const user = userEvent.setup();
    render(<EventPlannersPageContent />);
    expect(await screen.findByText("Bright Days")).toBeInTheDocument();
    expect(screen.getByText("Soon Events")).toBeInTheDocument();
    expect(screen.getByText("Gone Parties")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All (3)" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Suspended (1)" }));
    await waitFor(() => expect(AdminService.getPlanners).toHaveBeenLastCalledWith(expect.objectContaining({ status: "suspended" })));
    await waitFor(() => expect(screen.queryByText("Bright Days")).not.toBeInTheDocument());
    expect(screen.getByText("Gone Parties")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivate Gone Parties" })).toBeInTheDocument();
  });

  it("asks for a reason before suspending, then suspends with it", async () => {
    const user = userEvent.setup();
    render(<EventPlannersPageContent />);
    await user.click(await screen.findByRole("button", { name: "Suspend Bright Days" }));

    const dialog = screen.getByRole("dialog", { name: "Suspend Bright Days?" });
    const confirm = within(dialog).getByRole("button", { name: "Suspend account" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox"), "Several no-shows reported");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(MoneyService.setUserStatus).toHaveBeenCalledWith("p1", 0, "Several no-shows reported"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Suspend Bright Days?" })).not.toBeInTheDocument());
    // the list loads again with the new status
    expect((AdminService.getPlanners as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("cancelling the dialog changes nothing", async () => {
    const user = userEvent.setup();
    render(<EventPlannersPageContent />);
    await user.click(await screen.findByRole("button", { name: "Suspend Bright Days" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(MoneyService.setUserStatus).not.toHaveBeenCalled();
  });

  it("reactivates without needing a reason", async () => {
    const user = userEvent.setup();
    render(<EventPlannersPageContent />);
    await user.click(await screen.findByRole("button", { name: "Reactivate Gone Parties" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reactivate account" }));
    await waitFor(() => expect(MoneyService.setUserStatus).toHaveBeenCalledWith("p3", 1, undefined));
  });

  it("View opens the planner's details with documents, bookings and history", async () => {
    const user = userEvent.setup();
    render(<EventPlannersPageContent />);
    await user.click(await screen.findByRole("button", { name: "View Bright Days" }));

    const panel = await screen.findByRole("dialog", { name: "Planner details" });
    expect(AdminService.getPlanner).toHaveBeenCalledWith("p1");
    expect(await within(panel).findByText("Weddings in Texas")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Document 1/ })).toHaveAttribute("href", "https://cdn.test/event-planner/license/lic.pdf");
    expect(within(panel).getByText(/DJ set with Dee Sounds/)).toBeInTheDocument();
    expect(within(panel).getByText("Licence approved")).toBeInTheDocument();
    expect(within(panel).getByText("Planning: 2")).toBeInTheDocument();
  });
});
