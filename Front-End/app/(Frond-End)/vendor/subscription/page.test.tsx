import React from "react";
import { render, screen } from "@testing-library/react";
import VendorSubscriptionPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useFeature", () => ({ useFeatureOptIn: jest.fn() }));
jest.mock("@/service/subscription/subscription.service", () => ({
  SubscriptionService: { getCurrentPlan: jest.fn(), subscribeToPlan: jest.fn(), cancelSubscription: jest.fn() },
}));
import { useFeatureOptIn } from "@/hooks/useFeature";
import { SubscriptionService } from "@/service/subscription/subscription.service";

describe("vendor subscription page", () => {
  beforeEach(() => (SubscriptionService.getCurrentPlan as jest.Mock).mockResolvedValue({ data: { subscription_active: false, plan: null } }));

  it("says plans are coming later while they are switched off, with a way back", async () => {
    (useFeatureOptIn as jest.Mock).mockReturnValue(false);
    render(<VendorSubscriptionPage />);
    expect(screen.getByRole("heading", { name: "Subscriptions are coming later" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your listings" })).toHaveAttribute("href", "/vendor/listings");
    expect(useFeatureOptIn).toHaveBeenCalledWith("subscriptions");
    expect(SubscriptionService.subscribeToPlan).not.toHaveBeenCalled();
    expect(screen.queryByText(/plan from before/)).not.toBeInTheDocument();
  });

  it("tells a vendor with an older plan how to change it", async () => {
    (useFeatureOptIn as jest.Mock).mockReturnValue(false);
    (SubscriptionService.getCurrentPlan as jest.Mock).mockResolvedValue({ data: { subscription_active: true } });
    render(<VendorSubscriptionPage />);
    expect(await screen.findByText(/plan from before\. To change or cancel it, contact Vendly support/)).toBeInTheDocument();
  });

  it("shows the plans once they are switched on", async () => {
    (useFeatureOptIn as jest.Mock).mockReturnValue(true);
    render(<VendorSubscriptionPage />);
    expect(screen.queryByText("Subscriptions are coming later")).not.toBeInTheDocument();
    expect((await screen.findAllByText(/Starter/)).length).toBeGreaterThan(0);
  });
});
