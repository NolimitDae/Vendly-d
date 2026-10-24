"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { MoneyService, type NeedsReviewWithdrawal } from "@/service/admin/money.service";
import { apiError } from "@/service/contracts/contracts.service";

const money = (n: number | string) => "$" + Number(n).toFixed(2);

/**
 * Withdrawals Stripe didn't confirm ("needs_review"). Vendly checks them in Stripe every hour and
 * settles the clear ones; the rest wait here: mark completed if the transfer is in Stripe, or put
 * the money back in the vendor's balance if it isn't. Shows nothing when the list is empty.
 */
export default function NeedsReviewWithdrawals() {
  const [rows, setRows] = useState<NeedsReviewWithdrawal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    MoneyService.needsReviewWithdrawals()
      .then((res) => setRows(res.data?.data ?? []))
      .catch(() => setRows([]));

  useEffect(() => {
    load();
  }, []);

  const settle = async (w: NeedsReviewWithdrawal, outcome: "completed" | "returned") => {
    const who = w.user?.name || w.user?.email || "the vendor";
    const ask =
      outcome === "completed"
        ? `Mark the ${money(w.amount)} withdrawal by ${who} as completed? Only do this if the transfer is in Stripe.`
        : `Put ${money(w.amount)} back in ${who}'s Vendly balance? Only do this if no transfer was made in Stripe.`;
    if (!confirm(ask)) return;
    setBusy(w.id);
    try {
      await MoneyService.settleWithdrawal(w.id, outcome);
      toast.success(outcome === "completed" ? "Marked completed; the vendor was told" : "Money returned to the vendor's balance");
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't settle this withdrawal"));
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!rows.length) return null;

  return (
    <section aria-labelledby="needs-review-title" className="my-5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div>
        <h2 id="needs-review-title" className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4" aria-hidden /> Withdrawals to check ({rows.length})
        </h2>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Stripe didn&apos;t confirm these, so the money is off the vendor&apos;s balance. Vendly checks Stripe every hour and settles the clear ones; look these up in Stripe and settle them here.
        </p>
      </div>
      <ul className="divide-y divide-amber-200 dark:divide-amber-900/50">
        {rows.map((w) => (
          <li key={w.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium text-gray-900 dark:text-white">
                {money(w.amount)} · {w.user?.name || w.user?.email || "Unknown vendor"}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {dayjs(w.created_at).format("MMM D, YYYY h:mm A")} · withdraw-{w.id}
                {w.user?.stripe_connect_id ? ` · ${w.user.stripe_connect_id}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => settle(w, "completed")}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
              >
                Mark completed
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => settle(w, "returned")}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200 disabled:opacity-60"
              >
                {busy === w.id && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />} Return to balance
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
