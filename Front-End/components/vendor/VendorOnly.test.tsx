import { render, screen, waitFor } from "@testing-library/react";
import VendorOnly, { homeFor } from "./VendorOnly";
import { whoAmI } from "@/lib/currentUser";

const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
jest.mock("@/lib/currentUser", () => ({ whoAmI: jest.fn() }));

describe("VendorOnly", () => {
  beforeEach(() => replace.mockClear());

  it("shows vendor pages to the vendor account", async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: "v1", type: "VENDOR" });
    render(<VendorOnly><p>Earnings</p></VendorOnly>);
    expect(await screen.findByText("Earnings")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a customer to their bookings without showing the vendor page", async () => {
    (whoAmI as jest.Mock).mockResolvedValue({ id: "c1", type: "CUSTOMER" });
    render(<VendorOnly><p>Earnings</p></VendorOnly>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/bookings"));
    expect(screen.queryByText("Earnings")).not.toBeInTheDocument();
  });

  it("sends planners, admins and logged-out visitors to their own place", () => {
    expect(homeFor("EVENT_PLANNER")).toBe("/event-planner/profile");
    expect(homeFor("ADMIN")).toBe("/dashboard");
    expect(homeFor("CLIENT")).toBe("/bookings");
    expect(homeFor(null)).toBe("/login");
  });
});
