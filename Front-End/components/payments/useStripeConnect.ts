"use client";

import { useEffect, useState } from "react";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { CookieHelper } from "@/helper/cookie.helper";
import { Fetch } from "@/lib/Fetch";

const authHeaders = () => ({
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
});

/** Why Stripe's embedded components couldn't open; `fallback` is true when Stripe's own pages may still work. */
export type ConnectError = { message: string; fallback: boolean };

/**
 * Stripe Connect embedded components for the signed-in vendor's payout account (onboarding, payouts,
 * alerts). The server makes a short-lived session for their own account (POST /withdraw/account-session,
 * which creates the account when there is none); Stripe asks for a new one when it expires.
 */
export function useStripeConnect() {
  const [connect, setConnect] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<ConnectError | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      setError({ message: "Payout setup is not configured on this site yet.", fallback: true });
      return;
    }
    let cancelled = false;
    const fetchClientSecret = async () => {
      const res = await Fetch.post("/withdraw/account-session", {}, authHeaders());
      const secret = res.data?.data?.clientSecret;
      if (!secret) throw new Error(res.data?.message ?? "Could not open payout setup");
      return secret as string;
    };
    // first check a session can be made, so a refusal (e.g. a test account) shows its own message
    fetchClientSecret()
      .then(async (first) => {
        const { loadConnectAndInitialize } = await import("@stripe/connect-js/pure");
        let initial: string | null = first;
        const instance = loadConnectAndInitialize({
          publishableKey: key,
          fetchClientSecret: async () => {
            if (initial) {
              const s = initial;
              initial = null;
              return s;
            }
            return fetchClientSecret();
          },
          appearance: { variables: { colorPrimary: "#5e1b66", borderRadius: "12px" } },
        });
        if (!cancelled) setConnect(instance);
      })
      .catch((e) => {
        if (cancelled) return;
        const status = Number(e?.response?.status ?? 0);
        // a refusal about the account itself (test account, not a vendor) won't work on Stripe's pages either
        setError({ message: e?.response?.data?.message ?? e?.message ?? "Could not open payout setup", fallback: !(status >= 400 && status < 500) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { connect, error };
}

/**
 * Stripe's own setup page, for when the embedded form can't open: makes the payout account if there is
 * none, then sends the vendor to Stripe (they come back to the earnings page).
 */
export async function openHostedOnboarding() {
  const info = await Fetch.get("/withdraw/account-info", authHeaders()).catch(() => null);
  let accountId: string | undefined = info?.data?.data?.accountId ?? undefined;
  if (!accountId) {
    const made = await Fetch.post("/withdraw/create-connected-account", {}, authHeaders());
    accountId = made.data?.data?.accountId;
  }
  if (!accountId) throw new Error("Could not set up a payout account");
  const link = await Fetch.post(`/withdraw/onboarding/${accountId}`, {}, authHeaders());
  const url = link.data?.data?.url;
  if (!url) throw new Error(link.data?.message ?? "Could not open Stripe's setup page");
  window.location.href = url;
}
