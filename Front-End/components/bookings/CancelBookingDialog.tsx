"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, RotateCcw, X } from "lucide-react";
import { BookingService } from "@/service/booking/booking.service";
import { BookingMoneyService, money, type CancellationSummary } from "@/service/payments/booking-money.service";
import { CUSTOMER_CANCEL_REASONS, NON_PAYMENT_REASON, VENDOR_CANCEL_REASONS, type CancelReason } from "@/lib/cancel-reasons";

interface Props {
  bookingId: string;
  /** whose words: the customer's or the vendor's */
  role: "CUSTOMER" | "VENDOR";
  onClose: () => void;
  /** after a successful cancel, with what happens to the money */
  onCancelled?: (summary: CancellationSummary | null) => void;
  /** where "View booking" goes after cancelling (lists only) */
  bookingHref?: string;
  /**
   * The booking page opens its report form; without it the hint links to the booking page
   * (`bookingHref?report=1`). Shown when the start passed and the vendor never started.
   */
  onReportProblem?: () => void;
}

/**
 * Cancel confirmation that shows what cancelling now does with the money before the user confirms
 * (GET /bookings/:id/cancel-preview), and the refund result afterwards. The user picks a reason from
 * their list (with an optional note). A vendor's "Customer didn't pay" is previewed on its own: it
 * settles like a customer cancellation.
 */
export default function CancelBookingDialog({ bookingId, role, onClose, onCancelled, bookingHref, onReportProblem }: Props) {
  const [preview, setPreview] = useState<CancellationSummary | null>(null);
  const [reasons, setReasons] = useState<CancelReason[]>(role === "VENDOR" ? VENDOR_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CancellationSummary | null | undefined>(undefined);

  // the money changes only with the vendor's non-payment reason, so only that one asks again
  const previewFor = reasonCode === NON_PAYMENT_REASON ? NON_PAYMENT_REASON : undefined;
  useEffect(() => {
    let live = true;
    setLoading(true);
    BookingMoneyService.cancelPreview(bookingId, previewFor)
      .then((res) => {
        if (!live) return;
        const data: CancellationSummary | null = res.data?.data ?? null;
        setPreview(data);
        if (data?.reasons?.length) setReasons(data.reasons);
      })
      .catch((e) => live && setPreviewError(e?.response?.data?.message ?? "We couldn’t work out the refund right now. You can still cancel."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [bookingId, previewFor]);

  const confirm = async () => {
    if (!reasonCode) {
      setError("Pick a reason for cancelling.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await BookingService.cancel(bookingId, { reason_code: reasonCode, note: note.trim() || undefined });
      if (res.data?.success === false) throw new Error(res.data?.message);
      const summary: CancellationSummary | null = res.data?.data?.refund_summary ?? null;
      setDone(summary);
      onCancelled?.(summary);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "The booking couldn’t be cancelled. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const title = done !== undefined ? "Booking cancelled" : role === "VENDOR" ? "Cancel this booking?" : "Cancel your booking?";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title" className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="cancel-booking-title" className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done !== undefined ? (
          <>
            {done && done.refund_total > 0 && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <RotateCcw className="w-4 h-4 text-primary" aria-hidden /> Refund {money(done.refund_total)}
                </p>
                {role === "CUSTOMER" && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    To {done.card ?? "your card"} · {done.refund_timing ?? "5–10 business days"}
                  </p>
                )}
              </div>
            )}
            <p className="text-sm text-gray-700 dark:text-gray-300">{done?.message ?? "The booking is cancelled."}</p>
            <div className="flex gap-3">
              {bookingHref && (
                <Link href={bookingHref} className="flex-1 text-center px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
                  View booking
                </Link>
              )}
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Working out your refund…
              </p>
            ) : preview ? (
              <div className="space-y-2">
                {preview.report_problem_hint && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2" data-testid="report-problem-hint">
                    <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                      {preview.report_problem_hint}
                    </p>
                    {onReportProblem ? (
                      <button type="button" onClick={onReportProblem} className="text-sm font-semibold text-primary">
                        Report a problem
                      </button>
                    ) : bookingHref ? (
                      <Link href={`${bookingHref}?report=1`} className="text-sm font-semibold text-primary">
                        Report a problem
                      </Link>
                    ) : null}
                  </div>
                )}
                <p className="text-sm text-gray-800 dark:text-gray-200" data-testid="cancel-preview">{preview.message}</p>
                {preview.policy && preview.cancelled_by === "CUSTOMER" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {preview.policy.label} cancellation policy: {preview.policy.text}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-300">{previewError ?? "Any payment is refunded under the contract’s cancellation terms."}</p>
            )}

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Why are you cancelling?</legend>
              {reasons.map((r) => (
                <label key={r.key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer ${reasonCode === r.key ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"}`}>
                  <input type="radio" name="cancel-reason" value={r.key} checked={reasonCode === r.key} onChange={() => setReasonCode(r.key)} className="accent-primary" />
                  <span className="text-gray-800 dark:text-gray-200">{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Add a note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={role === "VENDOR" ? "The customer sees this" : "The vendor sees this"}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
                Keep booking
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy || loading || !reasonCode}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                Cancel booking
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
