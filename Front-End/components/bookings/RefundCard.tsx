"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { PaymentsService } from "@/service/payments/payments.service";
import { money } from "@/service/payments/booking-money.service";

interface RefundInfo {
  refunded?: number;
  refund_card?: string | null;
  refund_timing?: string | null;
  currency?: string;
}

/**
 * "Refund" card on a booking: how much went back, to which card (customers), and when it shows.
 * Reads the payments timeline (GET /bookings/:id/payments); hidden when nothing was refunded.
 */
export default function RefundCard({ bookingId, role, cancelledAt }: { bookingId: string; role: "CUSTOMER" | "VENDOR"; cancelledAt?: string | null }) {
  const [info, setInfo] = useState<RefundInfo | null>(null);

  useEffect(() => {
    let live = true;
    PaymentsService.timeline(bookingId)
      .then((res) => live && setInfo(res.data?.data ?? null))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [bookingId]);

  const amount = Number(info?.refunded ?? 0);
  if (!info || amount <= 0) return null;

  return (
    <section aria-labelledby="refund-card-title" className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-primary/20 space-y-2">
      <div className="flex items-center gap-2">
        <RotateCcw className="w-5 h-5 text-primary" aria-hidden />
        <h2 id="refund-card-title" className="font-semibold text-gray-900 dark:text-white">Refund</h2>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{money(amount, info.currency)}</p>
      {role === "CUSTOMER" ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Back to {info.refund_card ?? "the card you paid with"}. Refunds take {info.refund_timing ?? "5–10 business days"} to show on your statement
          {cancelledAt ? ` (cancelled ${new Date(cancelledAt).toLocaleDateString()})` : ""}.
        </p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">Refunded to the customer’s card.</p>
      )}
    </section>
  );
}
