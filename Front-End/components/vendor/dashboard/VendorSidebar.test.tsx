import React from "react";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VendorSidebar, { isActiveItem, vendorNavItems } from "./VendorSidebar";

let mockPath = "/vendor";
let mockTab: string | null = null;
jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockTab ? `tab=${mockTab}` : ""),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let mockRentals = true;
let mockPlans: boolean | undefined = false;
jest.mock("@/hooks/useFeature", () => ({
  useFeature: () => mockRentals,
  useFeatureOptIn: () => mockPlans,
}));

/** The desktop menu (the phone menu only renders once opened). */
const desktopMenu = () => within(screen.getAllByRole("navigation", { name: "Vendor pages" })[0]);

beforeEach(() => {
  mockPath = "/vendor";
  mockTab = null;
  mockRentals = true;
  mockPlans = false;
});

describe("VendorSidebar", () => {
  it("lists the vendor pages and highlights the current one", () => {
    mockPath = "/vendor/earnings";
    render(<VendorSidebar />);
    const links = desktopMenu().getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Dashboard", "Bookings", "Packages", "Rentals", "Earnings", "Contracts", "Add-ons", "Fees", "Reviews", "Profile"]);
    expect(desktopMenu().getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
    expect(desktopMenu().getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("highlights Dashboard only on the dashboard itself", () => {
    render(<VendorSidebar />);
    expect(desktopMenu().getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(desktopMenu().getAllByRole("link").filter((l) => l.getAttribute("aria-current"))).toHaveLength(1);
  });

  it("keeps a page's parent highlighted on the pages under it", () => {
    mockPath = "/vendor/bookings/b1";
    render(<VendorSidebar />);
    expect(desktopMenu().getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
  });

  it("tells Add-ons and Fees apart by the tab", () => {
    mockPath = "/vendor/add-ons";
    mockTab = "fees";
    render(<VendorSidebar />);
    expect(desktopMenu().getByRole("link", { name: "Fees" })).toHaveAttribute("aria-current", "page");
    expect(desktopMenu().getByRole("link", { name: "Add-ons" })).not.toHaveAttribute("aria-current");
  });

  it("hides Rentals when rentals are switched off, and shows Subscription once plans launch", () => {
    mockRentals = false;
    mockPlans = true;
    render(<VendorSidebar />);
    expect(desktopMenu().queryByRole("link", { name: "Rentals" })).not.toBeInTheDocument();
    expect(desktopMenu().getByRole("link", { name: "Subscription" })).toHaveAttribute("href", "/vendor/subscription");
  });

  it("opens and closes the phone menu from the keyboard", async () => {
    const user = userEvent.setup();
    mockPath = "/vendor/reviews";
    render(<VendorSidebar />);
    const button = screen.getByRole("button", { name: "Vendor menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("navigation", { name: "Vendor pages" })).toHaveLength(1);

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const drawer = within(document.getElementById("vendor-menu-drawer")!);
    expect(drawer.getByRole("link", { name: "Reviews" })).toHaveAttribute("aria-current", "page");
    // focus moves into the menu
    expect(drawer.getByRole("link", { name: "Dashboard" })).toHaveFocus();

    await act(async () => {
      await user.keyboard("{Escape}");
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });
});

describe("isActiveItem", () => {
  const items = vendorNavItems({ rentals: true, plans: true });
  const active = (path: string, tab: string | null = null) => items.filter((i) => isActiveItem(i, path, tab)).map((i) => i.label);

  it("matches one item per vendor page", () => {
    expect(active("/vendor")).toEqual(["Dashboard"]);
    expect(active("/vendor/listings/new")).toEqual(["Packages"]);
    expect(active("/vendor/add-ons")).toEqual(["Add-ons"]);
    expect(active("/vendor/add-ons", "fees")).toEqual(["Fees"]);
    expect(active("/vendor/subscription")).toEqual(["Subscription"]);
    // a look-alike path isn't a match
    expect(active("/vendor/bookingsx")).toEqual([]);
  });
});
