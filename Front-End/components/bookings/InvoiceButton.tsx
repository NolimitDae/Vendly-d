"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { downloadInvoice } from "@/service/payments/booking-money.service";

/** "Download invoice": the final invoice PDF (GET /bookings/:id/invoice), for finished bookings with payments. */
export default function InvoiceButton({ bookingId, className }: { bookingId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadInvoice(bookingId);
    } catch {
      toast.error("The invoice couldn’t be downloaded. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
      }
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FileDown className="w-4 h-4" aria-hidden />}
      Download invoice
    </button>
  );
}

/** COMPLETED or CANCELLED with something paid: the invoice is final. */
export const invoiceAvailable = (b: { status: string; paid_at?: string | null }) => !!b.paid_at && (b.status === "COMPLETED" || b.status === "CANCELLED");
