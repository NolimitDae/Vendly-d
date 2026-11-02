"use client";

import { useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { ConnectAccountManagement, ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js";
import { openHostedOnboarding, useStripeConnect } from "./useStripeConnect";

/**
 * Stripe's payout setup (Connect embedded onboarding) in a window on Vendly's page, instead of sending
 * the vendor to Stripe's site. The server makes the vendor's payout account if they have none yet.
 * `onClose` runs when the vendor finishes or leaves; the page then reloads the account's status from
 * Stripe. If the embedded form can't open, the vendor can continue on Stripe's own setup page.
 * With `manage` (a vendor who has finished setup) it shows Stripe's account management instead, to
 * change the bank account and details later.
 */
export default function StripeOnboardingDialog({ onClose, manage = false }: { onClose: () => void; manage?: boolean }) {
  const { connect, error } = useStripeConnect();
  const [leaving, setLeaving] = useState(false);
  const [hostedError, setHostedError] = useState<string | null>(null);

  const continueOnStripe = async () => {
    setLeaving(true);
    setHostedError(null);
    try {
      await openHostedOnboarding();
    } catch (e: any) {
      setHostedError(e?.response?.data?.message ?? e?.message ?? "Could not open Stripe's setup page");
      setLeaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payout-setup-title">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="payout-setup-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {manage ? "Payout details" : "Set up payouts"}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {manage
                ? "Change the bank account your earnings go to, or update your details. Stripe, Vendly's payment partner, keeps them safe."
                : "Stripe, Vendly's payment partner, verifies your details and sends your earnings to your bank."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600" role="alert">
              {error.message}
            </p>
            {error.fallback && (
              <>
                <button
                  type="button"
                  onClick={continueOnStripe}
                  disabled={leaving}
                  className="gradient-bg flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Continue on Stripe&apos;s site
                </button>
                {hostedError && <p className="text-sm text-red-600">{hostedError}</p>}
              </>
            )}
          </div>
        ) : !connect ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ConnectComponentsProvider connectInstance={connect}>
            {manage ? <ConnectAccountManagement /> : <ConnectAccountOnboarding onExit={onClose} />}
          </ConnectComponentsProvider>
        )}
      </div>
    </div>
  );
}
