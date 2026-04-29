import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const WalletService = {
  /**
   * Get Stripe connected account info (has balance, account status).
   * For users without a connected account this will 404 — callers should catch.
   */
  getAccountInfo: async () => Fetch.get("/withdraw/account-info", authHeaders()),

  /**
   * Get balance from Stripe connected account (vendors).
   * Throws if no connected account exists.
   */
  getStripeBalance: async () => Fetch.get("/withdraw/balance", authHeaders()),

  /**
   * Create a Stripe PaymentIntent for depositing funds.
   * Returns { client_secret, payment_intent_id, amount, currency }
   */
  deposit: async (amount: number, currency = "usd") =>
    Fetch.post("/deposite/add-balance", { amount, currency }, authHeaders()),

  /**
   * Withdraw funds to the vendor's connected Stripe account.
   */
  withdraw: async (amount: number, currency = "usd") =>
    Fetch.post("/withdraw/request", { amount, currency }, authHeaders()),

  /**
   * Get withdrawal transaction history for the current user.
   */
  getTransactions: async () => Fetch.get("/withdraw/history", authHeaders()),

  /**
   * Create a Stripe Connected Account (required before withdrawing).
   */
  createConnectedAccount: async () =>
    Fetch.post("/withdraw/create-connected-account", {}, authHeaders()),

  /**
   * Get the Stripe onboarding link for an account ID.
   */
  getOnboardingLink: async (accountId: string) =>
    Fetch.post(`/withdraw/onboarding/${accountId}`, {}, authHeaders()),
};
