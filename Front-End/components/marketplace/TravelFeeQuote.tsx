"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { ContractsService } from "@/service/contracts/contracts.service";
import { distanceText, type TravelQuote } from "@/lib/travel-fee";

/** Wait this long after typing stops before asking (picking a suggestion changes the address at once). */
const PAUSE_MS = 700;

/**
 * The distance and travel fee for the address being entered, worked out on the server. Only an estimate
 * for the customer: the request prices it again itself.
 */
export default function TravelFeeQuote({ listingId, address, termsText }: { listingId: string; address: string; termsText: string }) {
  const [quote, setQuote] = useState<TravelQuote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const a = address.trim();
    setQuote(null);
    if (a.length < 5) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      ContractsService.travelFee(listingId, a)
        .then((res) => live && setQuote(res.data?.data?.applies ? res.data.data : null))
        .catch(() => live && setQuote(null))
        .finally(() => live && setLoading(false));
    }, PAUSE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [listingId, address]);

  const distance = quote && distanceText(quote);
  return (
    <div className="mt-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300" data-testid="travel-quote" aria-live="polite">
      <p className="flex items-start gap-2">
        <Truck className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" aria-hidden />
        <span>Travel fee: {termsText}.</span>
      </p>
      {loading && (
        <p className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Working out the distance…
        </p>
      )}
      {!loading && quote?.status === "PRICED" && (
        <p className="mt-1 font-medium text-gray-900 dark:text-white">
          {distance ? `${distance}. ` : ""}Your travel fee: ${(quote.fee ?? 0).toFixed(2)}
        </p>
      )}
      {!loading && quote?.message && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{quote.message}</p>}
    </div>
  );
}
