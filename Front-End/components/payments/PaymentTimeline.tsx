"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { AlertCircle, CheckCircle2, Clock, Loader2, Lock, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { PaymentsService, PLAN_LABELS, type Installment, type PaymentTimeline as Timeline } from "@/service/payments/payments.service";

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const STATUS: Record<Installment["status"], { label: string; cls: string; Icon: typeof Clock }> = {
  SCHEDULED: { label: "Scheduled", cls: "text-gray-500", Icon: Clock },
  PROCESSING: { label: "Card held", cls: "text-amber-500", Icon: Lock },
  PAID: { label: "Paid", cls: "text-green-600", Icon: CheckCircle2 },
  FAILED: { label: "Payment failed", cls: "text-red-500", Icon: AlertCircle },
  CANCELLED: { label: "Cancelled", cls: "text-gray-500", Icon: XCircle },
  REFUNDED: { label: "Refunded", cls: "text-primary", Icon: RotateCcw },
};

/** Customer's payment timeline for a booking with retry, confirm-work and report-a-problem actions. */
export default function PaymentTimeline({ bookingId, bookingStatus, onChanged }: { bookingId: string; bookingStatus: string; onChanged?: () => void }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await PaymentsService.timeline(bookingId);
      setT(res.data?.data ?? null);
    } catch {
      setT(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? fail);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  if (!t || t.installments.length === 0) return null;

  const canApprove = bookingStatus === "COMPLETED" && !t.customer_approved_at && !t.released_at && !t.dispute;
  const canDispute = ["IN_PROGRESS", "COMPLETED"].includes(bookingStatus) && !t.released_at && !t.dispute;

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">Payments</h2>
        {t.plan && <p className="text-xs text-gray-500 dark:text-gray-400">{PLAN_LABELS[t.plan]}</p>}
      </div>

      <ul className="space-y-3">
        {t.installments.map((i) => {
          const st = STATUS[i.status];
          return (
            <li key={i.id} className="flex items-start gap-3">
              <st.Icon className={`w-5 h-5 mt-0.5 ${st.cls}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{i.label}</p>
                <p className={`text-xs ${st.cls}`}>
                  {st.label}
                  {i.status === "PAID" && i.paid_at ? ` · ${dayjs(i.paid_at).format("MMM D")}` : ""}
                  {i.status === "SCHEDULED" && i.attempts === 0 ? ` · due ${dayjs(i.due_at).format("MMM D, YYYY")}` : ""}
                  {i.status === "SCHEDULED" && i.attempts > 0 && i.next_attempt_at ? ` · retrying ${dayjs(i.next_attempt_at).format("MMM D, h:mm A")}` : ""}
                  {i.refunded_amount > 0 ? ` · ${money(i.refunded_amount)} refunded` : ""}
                </p>
                {i.last_error && i.status !== "PAID" && <p className="text-xs text-red-500">{i.last_error}</p>}
                {i.status === "FAILED" && (
                  <button type="button" disabled={busy} onClick={() => run(() => PaymentsService.retry(bookingId, i.id), "Payment failed again")} className="mt-1 text-xs font-semibold text-primary">
                    Try again
                  </button>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{money(i.amount)}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
        <span>Paid {money(t.paid)} of {money(t.total)}</span>
        {t.outstanding > 0 && <span>{money(t.outstanding)} to go</span>}
      </div>

      {t.dispute && !t.dispute.resolved_at ? (
        <p className="text-xs text-amber-600 flex gap-2"><ShieldCheck className="w-4 h-4" />You reported a problem on {dayjs(t.dispute.opened_at).format("MMM D")}. The vendor isn&apos;t paid until Vendly resolves it.</p>
      ) : t.released_at ? (
        <p className="text-xs text-green-600 flex gap-2"><CheckCircle2 className="w-4 h-4" />Paid to the vendor on {dayjs(t.released_at).format("MMM D, YYYY")}.</p>
      ) : t.release_at ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Vendly holds the money until {dayjs(t.release_at).format("MMM D, h:mm A")}. Confirm the work to pay the vendor sooner, or report a problem before then.</p>
      ) : t.paid > 0 ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Vendly holds your payment until the service is done.</p>
      ) : null}

      {(canApprove || canDispute) && (
        <div className="flex flex-wrap items-center gap-3">
          {canApprove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm("Confirm the work was done and pay the vendor?") && run(() => PaymentsService.approve(bookingId), "Could not confirm")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
            >
              Confirm work was done
            </button>
          )}
          {canDispute && !disputing && (
            <button type="button" onClick={() => setDisputing(true)} className="text-sm font-semibold text-primary">Report a problem</button>
          )}
        </div>
      )}
      {disputing && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What went wrong? (at least 10 characters)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setDisputing(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 10}
              onClick={() => run(async () => { await PaymentsService.dispute(bookingId, reason.trim()); setDisputing(false); }, "Could not send")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
            >
              Send report
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
