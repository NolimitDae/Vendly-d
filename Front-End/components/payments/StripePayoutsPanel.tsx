"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ConnectComponentsProvider, ConnectNotificationBanner, ConnectPayouts } from "@stripe/react-connect-js";
import { useStripeConnect } from "./useStripeConnect";
import { INSTANT_PAYOUT_TEXT, STANDARD_PAYOUT_TEXT } from "@/lib/payouts";

/**
 * The vendor's payout account as Stripe has it (Connect embedded components): anything Stripe still needs
 * from them, their Stripe balance, the payouts on their way to their bank, and instant cash-outs (with
 * Stripe's fee disclosed here and again before they confirm). Only for vendors who already
 * have a payout account. Left out entirely when Stripe's components can't load, so the page still works.
 */
export default function StripePayoutsPanel() {
  const { connect, error } = useStripeConnect();
  const [failed, setFailed] = useState(false);
  if (error || failed) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">Bank payouts</h2>
        <p className="text-xs text-gray-400 mt-0.5">Your Stripe balance, and when Stripe sends it to your bank</p>
      </div>
      <div className="px-6 pt-4 space-y-1.5 text-xs text-gray-500 dark:text-gray-400" data-testid="payout-fees">
        <p>{STANDARD_PAYOUT_TEXT}</p>
        <p>{INSTANT_PAYOUT_TEXT}</p>
      </div>
      {/* Stripe's components are drawn in the site's colours (useStripeConnect), on the card itself */}
      <div className="p-6 space-y-4">
        {!connect ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <ConnectComponentsProvider connectInstance={connect}>
            <ConnectNotificationBanner onLoadError={() => undefined} />
            <ConnectPayouts onLoadError={() => setFailed(true)} />
          </ConnectComponentsProvider>
        )}
      </div>
    </div>
  );
}
