import React from "react";
import { render, screen, within } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { navItems, navSections } from "@/data/sidebar";

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/disputes",
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
let mockPlans: boolean | undefined = false;
jest.mock("@/hooks/useFeature", () => ({ useFeatureOptIn: () => mockPlans }));
jest.mock("@/components/brand/SiteLogo", () => ({ __esModule: true, default: () => <span>Vendly</span> }));
jest.mock("../Dashboard/auth/LogoutModal", () => ({ __esModule: true, default: () => null }));

describe("admin menu", () => {
  it("groups the links under labels, admin controls together", () => {
    render(<Sidebar isOpen={false} onClose={() => {}} />);
    for (const title of ["People", "Marketplace", "Money", "Reviews & reports", "Admin controls", "Account"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    const controls = within(screen.getByRole("group", { name: "Admin controls" }));
    for (const label of ["Settings", "Service categories", "Promo codes", "Privacy Policy"]) expect(controls.getByText(label)).toBeInTheDocument();
    const reviews = within(screen.getByRole("group", { name: "Reviews & reports" }));
    for (const label of ["Disputes", "Fee reviews", "Chat reports"]) expect(reviews.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("keeps every page it had, and hides vendor plans until they launch", () => {
    const hrefs = navItems.map((i) => i.href);
    for (const href of ["/dashboard", "/dashboard/vendors", "/dashboard/event-planners", "/dashboard/listings", "/dashboard/bookings", "/dashboard/contracts", "/dashboard/transactions", "/dashboard/revenue", "/dashboard/disputes", "/dashboard/fee-reviews", "/dashboard/identity", "/dashboard/chat-reports", "/dashboard/promos", "/dashboard/services", "/dashboard/settings", "/dashboard/privacy", "/chat", "/wallet"]) {
      expect(hrefs).toContain(href);
    }
    expect(navSections.every((s) => s.items.length > 0)).toBe(true);
    render(<Sidebar isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText("Subscription")).toBeNull();
  });
});
