import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const SubscriptionService = {
  /** Vendor's current active subscription plan */
  getCurrentPlan: async () => Fetch.get("/subscription/my", authHeaders()),

  /** All available subscription plan definitions */
  getAvailablePlans: async () => Fetch.get("/subscription/plans", authHeaders()),

  /**
   * Start Stripe checkout for a plan.
   * Returns { data: { url: string } } — redirect user to the checkout URL.
   */
  subscribeToPlan: async (planId: string, billing: "monthly" | "yearly") =>
    Fetch.post("/subscription/checkout", { planId, billing }, authHeaders()),

  /** Cancel the vendor's active subscription */
  cancelSubscription: async () =>
    Fetch.delete("/subscription/cancel", authHeaders()),
};
