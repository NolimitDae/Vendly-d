import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import VendorDashboardPage from "./page";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock("@/service/vendor/vendor-dashboard.service", () => ({ VendorDashboardService: { home: jest.fn() } }));
jest.mock("@/service/earnings/earnings.service", () => ({ EarningsService: { getDashboardStats: jest.fn() } }));
jest.mock("@/service/vendor/vendor-listing.service", () => ({ VendorListingService: { getMyListings: jest.fn() } }));
jest.mock("@/service/auth/auth.service", () => ({ AuthService: { me: jest.fn() } }));
jest.mock("@/service/booking/booking.service", () => ({ BookingService: { trackerStep: jest.fn(), startWork: jest.fn(), complete: jest.fn() } }));

import { VendorDashboardService } from "@/service/vendor/vendor-dashboard.service";
import { EarningsService } from "@/service/earnings/earnings.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { AuthService } from "@/service/auth/auth.service";

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ data: { success: true, data, ...extra } });

beforeEach(() => {
  (AuthService.me as jest.Mock).mockResolvedValue(ok({ name: "Sam Sounds" }));
  (VendorListingService.getMyListings as jest.Mock).mockResolvedValue(ok([{ id: "l1" }], { meta: { total: 3 } }));
  (EarningsService.getDashboardStats as jest.Mock).mockResolvedValue(
    ok({
      revenue_by_month: [
        { month: "2026-10", label: "Oct", earned: 300 },
        { month: "2026-11", label: "Nov", earned: 450 },
      ],
      total_earned: 750,
      bookings: { total: 9, by_status: { COMPLETED: 4, CONFIRMED: 2, IN_PROGRESS: 1, CANCELLED: 1 }, upcoming: 3 },
      rating: { average: 4.8, count: 6 },
      top_clients: [{ id: "c1", name: "Ana Lee", earned: 500, bookings: 2 }],
    }),
  );
  (VendorDashboardService.home as jest.Mock).mockResolvedValue(
    ok({
      attention: [{ kind: "request", booking_id: "b1", title: "Party DJ", customer_name: "Ana Lee", at: new Date(Date.now() + 30 * 3600e3).toISOString() }],
      upcoming: [
        {
          id: "b2",
          status: "CONFIRMED",
          title: "Studio session",
          amount: 200,
          event_start_at: "2026-11-14T16:00:00Z",
          event_end_at: null,
          scheduled_at: null,
          customer: { id: "c2", name: "Bo Diaz", avatar_url: null },
          is_rental: false,
          service_at: "VENDOR_LOCATION",
          steps_open: true,
          payment_state: null,
        },
      ],
    }),
  );
});

it("shows what needs attention, the numbers, the chart and the next bookings", async () => {
  render(<VendorDashboardPage />);
  expect(await screen.findByRole("heading", { name: "Hello Sam!" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("1 booking request waiting for your answer")).toBeInTheDocument());

  expect(screen.getByText("Booking request from Ana Lee")).toBeInTheDocument();
  expect(screen.getByText("$750.00")).toBeInTheDocument();
  expect(screen.getByText("4.8 (6)")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("Best month: Nov at $450.00")).toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: "Earned by month" })).getByText("$300.00")).toBeInTheDocument();
  expect(within(screen.getByRole("heading", { name: "Top clients" }).closest("section")!).getByText("Ana Lee")).toBeInTheDocument();

  const upcoming = screen.getByRole("heading", { name: "Upcoming bookings" }).closest("section")!;
  expect(within(upcoming).getByText("Studio session")).toBeInTheDocument();
  // the day-of buttons are open: the customer comes to the vendor
  expect(within(upcoming).getByRole("button", { name: "Customer arrived" })).toBeInTheDocument();
  expect(within(upcoming).getByRole("link", { name: /View booking/ })).toHaveAttribute("href", "/vendor/bookings/b2");
  expect(VendorListingService.getMyListings).toHaveBeenCalledWith({ status: "ACTIVE", limit: 1 });
});

it("says so when the attention list can't load", async () => {
  (VendorDashboardService.home as jest.Mock).mockRejectedValue(new Error("down"));
  render(<VendorDashboardPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load what needs your attention.");
});
