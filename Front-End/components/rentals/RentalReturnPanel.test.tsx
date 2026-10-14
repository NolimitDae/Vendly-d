import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RentalReturnPanel, { type RentalBookingFields } from "./RentalReturnPanel";

jest.mock("@/service/rentals/rentals.service", () => ({
  ...jest.requireActual("@/service/rentals/rentals.service"),
  RentalsService: { recordReturn: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { RentalsService } from "@/service/rentals/rentals.service";
import { toast } from "react-toastify";

const booking = (over: Partial<RentalBookingFields> = {}): RentalBookingFields => ({
  id: "b1",
  status: "IN_PROGRESS",
  is_rental: true,
  security_deposit: 219,
  rental_reservations: [{ id: "r1", quantity: 48, start_date: "2026-10-17T00:00:00.000Z", end_date: "2026-10-19T00:00:00.000Z", item: { id: "chairs", title: "Gold Chiavari Chair" } }],
  rental_return: null,
  ...over,
});

describe("RentalReturnPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    (RentalsService.recordReturn as jest.Mock).mockResolvedValue({ data: { success: true } });
  });

  it("renders nothing for a normal booking", () => {
    const { container } = render(<RentalReturnPanel booking={{ id: "b", status: "CONFIRMED" }} role="VENDOR" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the vendor check everything back in with no fees", async () => {
    const onChanged = jest.fn();
    render(<RentalReturnPanel booking={booking()} role="VENDOR" onChanged={onChanged} />);
    expect(screen.getByText("Gold Chiavari Chair")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /everything came back ok/i }));
    await waitFor(() => expect(RentalsService.recordReturn).toHaveBeenCalledWith("b1", { damage_fee: undefined, late_fee: undefined, notes: undefined, photos: [] }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("needs a note or photos before charging fees", async () => {
    const user = userEvent.setup();
    render(<RentalReturnPanel booking={booking()} role="VENDOR" />);
    await user.click(screen.getByRole("button", { name: /report damage/i }));
    await user.type(screen.getByLabelText(/damage fee/i), "40");
    await user.click(screen.getByRole("button", { name: /^record return$/i }));
    expect(RentalsService.recordReturn).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    await user.type(screen.getByLabelText(/what happened/i), "Two chairs cracked");
    await user.click(screen.getByRole("button", { name: /^record return$/i }));
    await waitFor(() => expect(RentalsService.recordReturn).toHaveBeenCalledWith("b1", expect.objectContaining({ damage_fee: 40, notes: "Two chairs cracked" })));
  });

  it("shows the customer the deposit hold, then the outcome", () => {
    const { rerender } = render(<RentalReturnPanel booking={booking()} role="CUSTOMER" />);
    expect(screen.getByText(/\$219\.00 security deposit is held/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /everything came back ok/i })).toBeNull();
    rerender(<RentalReturnPanel booking={booking({ rental_return: { damage_fee: 30, late_fee: 0, notes: "Bent frame", created_at: "2026-10-20T10:00:00Z" } })} role="CUSTOMER" />);
    expect(screen.getByText(/Damage fee: \$30\.00/)).toBeInTheDocument();
    expect(screen.getByText(/open a dispute within 48 hours/i)).toBeInTheDocument();
  });
});
