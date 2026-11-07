import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PackageAddOns, { emptyPackageAddOns } from "./PackageAddOns";
import { AddOnsService } from "@/service/add-ons/add-ons.service";

jest.mock("@/service/add-ons/add-ons.service", () => ({
  AddOnsService: { list: jest.fn(), forListing: jest.fn(), update: jest.fn(), create: jest.fn(), setForListing: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const bartender = { id: "ao-1", kind: "ADD_ON", name: "Bartender", description: null, price: 40, price_unit: "PER_HOUR", price_text: "$40.00 per hour", max_quantity: null, in_library: true };

describe("PackageAddOns", () => {
  beforeEach(() => {
    (AddOnsService.list as jest.Mock).mockResolvedValue({ data: { data: [bartender] } });
    (AddOnsService.forListing as jest.Mock).mockResolvedValue({ data: { data: { add_ons: [bartender], fees: [] } } });
  });

  it("edits an add-on from the package form, and the change shows straight away", async () => {
    const user = userEvent.setup();
    (AddOnsService.update as jest.Mock).mockResolvedValue({ data: { data: { ...bartender, price: 55, price_text: "$55.00 per hour" } } });
    render(<PackageAddOns listingId="l1" value={emptyPackageAddOns()} onChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Edit Bartender" }));
    const price = screen.getByLabelText("Price");
    await user.clear(price);
    await user.type(price, "55");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(AddOnsService.update).toHaveBeenCalledWith("ao-1", expect.objectContaining({ name: "Bartender", price: 55, price_unit: "PER_HOUR" })));
    expect(await screen.findByText("$55.00 per hour")).toBeInTheDocument();
  });

  it("has no 'this package only' choice: new ones go to the library", async () => {
    const user = userEvent.setup();
    render(<PackageAddOns value={emptyPackageAddOns()} onChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /^new add-on$/i }));
    expect(screen.queryByText(/also save to my library/i)).not.toBeInTheDocument();
  });
});
