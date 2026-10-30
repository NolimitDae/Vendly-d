import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VendorPromoCodes from "./VendorPromoCodes";
import { VendorPromosService } from "@/service/promos/vendor-promos.service";

jest.mock("@/service/promos/vendor-promos.service", () => ({ VendorPromosService: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() } }));
jest.mock("@/service/vendor/vendor-listing.service", () => ({
  VendorListingService: { getMyListings: jest.fn().mockResolvedValue({ data: { data: [{ id: "l1", title: "Bridal Glam" }, { id: "l2", title: "Party Glam" }] } }) },
}));
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

describe("vendor promo codes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (VendorPromosService.list as jest.Mock).mockResolvedValue({
      data: { data: [{ id: "p1", code: "GLAM10", percent_off: 10, amount_off: null, uses: 2, max_uses: 5, active: true, once_per_customer: true, first_booking_only: false, listing_ids: ["l1"] }] },
    });
    (VendorPromosService.create as jest.Mock).mockResolvedValue({ data: { success: true } });
  });

  it("lists the vendor's codes with what they give and where they work", async () => {
    render(<VendorPromoCodes />);
    expect(await screen.findByText("GLAM10")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/10% off · once per customer · Bridal Glam/)).toBeInTheDocument());
    expect(screen.getByText(/Used 2 of 5 times/)).toBeInTheDocument();
  });

  it("creates a code for some packages only", async () => {
    render(<VendorPromoCodes />);
    await screen.findByText("GLAM10");
    fireEvent.click(screen.getByRole("button", { name: /New code/ }));
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "summer15" } });
    fireEvent.change(screen.getByLabelText("Percent off"), { target: { value: "15" } });
    fireEvent.click(screen.getByLabelText("Only some packages"));
    fireEvent.click(await screen.findByLabelText("Party Glam"));
    fireEvent.click(screen.getByRole("button", { name: "Create code" }));
    await waitFor(() =>
      expect(VendorPromosService.create).toHaveBeenCalledWith(expect.objectContaining({ code: "SUMMER15", percent_off: 15, amount_off: null, listing_ids: ["l2"], once_per_customer: true })),
    );
  });
});
