import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingsPageContent from "./BookingsPageContent";
import VendorsPageContent from "../vendors/VendorsPageContent";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/service/admin/admin.service", () => ({ AdminService: { getBookings: jest.fn(), getVendors: jest.fn() } }));
jest.mock("@/service/admin/money.service", () => ({ MoneyService: { setUserStatus: jest.fn() } }));

import { AdminService } from "@/service/admin/admin.service";

beforeEach(() => {
  (AdminService.getBookings as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          id: "cmbooking0001abcd",
          status: "CONFIRMED",
          created_at: "2026-09-01T10:00:00Z",
          event_start_at: "2026-11-20T18:00:00Z",
          amount: "450.00",
          service_fee: "22.50",
          venue_address: "1 Hall Road",
          listing: { title: "Wedding DJ", images: [] },
          customer: { name: "Cara Customer", email: "cara@x.com" },
          vendor: { name: "Dee Sounds", email: "dee@x.com" },
        },
      ],
    },
  });
  (AdminService.getVendors as jest.Mock).mockResolvedValue({
    data: {
      success: true,
      data: [{ id: "v1", name: "Dee", email: "dee@x.com", avatar: null, created_at: "2026-01-01T00:00:00Z", status: 1, business_name: "Dee Sounds", address: "Austin", license_status: "APPROVED", total_listings: 3, total_bookings: 9 }],
    },
  });
});

describe("admin View buttons", () => {
  it("opens a booking's details", async () => {
    const user = userEvent.setup();
    render(<BookingsPageContent />);
    await user.click(await screen.findByRole("button", { name: "View details" }));
    const panel = screen.getByRole("dialog", { name: "Booking details" });
    expect(within(panel).getByText("Wedding DJ")).toBeInTheDocument();
    expect(within(panel).getByText("Cara Customer · cara@x.com")).toBeInTheDocument();
    expect(within(panel).getByText("$22.50")).toBeInTheDocument();
    expect(within(panel).getByText("1 Hall Road")).toBeInTheDocument();
  });

  it("opens a vendor's details with a link to their shop", async () => {
    const user = userEvent.setup();
    render(<VendorsPageContent />);
    await user.click(await screen.findByRole("button", { name: "View details" }));
    const panel = screen.getByRole("dialog", { name: "Vendor details" });
    expect(within(panel).getByText("Dee Sounds")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open shop page" })).toHaveAttribute("href", "/marketplace/vendors/v1");
  });
});
