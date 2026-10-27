"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { BANK_CLEARING_TEXT, PaymentsService, type PaymentTimeline } from "@/service/payments/payments.service";

const money = (n: number) => `$${Number(n).toFixed(2)}`;

/**
 * The vendor's view of a customer's bank payment that is still clearing (large bookings): what's on
 * its way, and that the payout waits for it. Reads the payments timeline; hidden when nothing is processing.
 */
export default function BankPaymentNotice({ bookingId }: { bookingId: string }) {
  const [t, setT] = useState<PaymentTimeline | null>(null);

  useEffect(() => {
    let live = true;
    PaymentsService.timeline(bookingId)
      .then((res) => live && setT(res.data?.data ?? null))
      .catch(() => live && setT(null));
    return () => {
      live = false;
    };
  }, [bookingId]);

  const processing = Number(t?.processing ?? 0);
  if (!t || processing <= 0) return null;
  const items = t.installments.filter((i) => i.clearing).map((i) => i.label.toLowerCase());

  return (
    <p className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex gap-2" data-testid="bank-processing">
      <Landmark className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
      <span>
        Processing: the customer is paying {money(processing)} ({items.join(", ")}) from their bank account. Bank payments take {BANK_CLEARING_TEXT} to clear. You’re paid for it once it has, and a deposit can be released early only after that.
      </span>
    </p>
  );
}
