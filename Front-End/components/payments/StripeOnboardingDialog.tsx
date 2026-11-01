"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js";
import { CookieHelper } from "@/helper/cookie.helper";
import { Fetch } from "@/lib/Fetch";

/**
 * Stripe's payout setup (Connect embedded onboarding) in a window on Vendly's page, instead of sending
 * the vendor to Stripe's site. The server makes the vendor's payout account if they have none yet, and
 * gives this page a short-lived session for it (POST /withdraw/account-session). `onClose` runs when
 * the vendor finishes or leaves; the page then reloads the account's status from Stripe.
 */
export default function StripeOnboardingDialog({ onClose }: { onClose: () => void }) {
  const [connect, setConnect] = useState<StripeConnectInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      setError("Payout setup is not configured on this site yet.");
      return;
    }
    let cancelled = false;
    // Stripe asks for a new session again when one expires, so this runs more than once
    const fetchClientSecret = async () => {
      const res = await Fetch.post("/withdraw/account-session", {}, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
      });
      const secret = res.data?.data?.clientSecret;
      if (!secret) throw new Error(res.data?.message ?? "Could not open payout setup");
      return secret as string;
    };
    // first check the session can be made, so a refusal (e.g. a test account) shows its own message
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
      .catch((e) => !cancelled && setError(e?.response?.data?.message ?? e?.message ?? "Could not open payout setup"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payout-setup-title">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="payout-setup-title" className="text-lg font-semibold text-gray-900">
              Set up payouts
            </h2>
            <p className="mt-1 text-sm text-gray-500">Stripe, Vendly&apos;s payment partner, verifies your details and sends your earnings to your bank.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : !connect ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ConnectComponentsProvider connectInstance={connect}>
            <ConnectAccountOnboarding onExit={onClose} />
          </ConnectComponentsProvider>
        )}
      </div>
    </div>
  );
}
