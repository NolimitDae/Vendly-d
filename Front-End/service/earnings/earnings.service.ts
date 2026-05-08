import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const EarningsService = {
  /** All bookings for the vendor, optionally filtered by status */
  getBookings: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) => {
    const q = new URLSearchParams();
    if (params)
      Object.entries(params).forEach(
        ([k, v]) => v !== undefined && v !== "" && q.set(k, String(v)),
      );
    return Fetch.get(`/bookings/my/vendor?${q.toString()}`, authHeaders());
  },

  /** Withdrawal transaction history */
  getWithdrawHistory: async () => Fetch.get("/withdraw/history", authHeaders()),

  /** Stripe connected account info (has balance / account status) */
  getAccountInfo: async () =>
    Fetch.get("/withdraw/account-info", authHeaders()),

  /** Stripe account balance (requires connected account) */
  getStripeBalance: async () => Fetch.get("/withdraw/balance", authHeaders()),

  /** Request payout to Stripe connected account */
  requestPayout: async (amount: number) =>
    Fetch.post("/withdraw/request", { amount }, authHeaders()),

  /** Create Stripe Connect account */
  createConnectedAccount: async () =>
    Fetch.post("/withdraw/create-connected-account", {}, authHeaders()),

  /** Stripe Connect onboarding link */
  getOnboardingLink: async (accountId: string) =>
    Fetch.post(`/withdraw/onboarding/${accountId}`, {}, authHeaders()),
};
