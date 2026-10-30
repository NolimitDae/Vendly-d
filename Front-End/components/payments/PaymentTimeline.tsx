"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { AlertCircle, CheckCircle2, Clock, Landmark, Loader2, Lock, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "react-toastify";
import { BANK_CLEARING_TEXT, PaymentsService, planText, type Installment, type PaymentTimeline as Timeline } from "@/service/payments/payments.service";
import { BookingService } from "@/service/booking/booking.service";
import ReportProblemForm from "@/components/disputes/ReportProblemForm";
import SavedCards from "@/components/payments/SavedCards";
import { dueByText, paymentStateText } from "@/lib/booking-status";
import { paymentStatusText } from "@/lib/payment-plan";
import DisputeDetails, { type DisputeDetailFields } from "@/components/disputes/DisputeDetails";

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const STATUS: Record<Installment["status"], { label: string; cls: string; Icon: typeof Clock }> = {
  SCHEDULED: { label: "Scheduled", cls: "text-gray-500", Icon: Clock },
  PROCESSING: { label: "Card held", cls: "text-amber-500", Icon: Lock },
  PAID: { label: "Paid", cls: "text-green-600", Icon: CheckCircle2 },
  FAILED: { label: "Payment failed", cls: "text-red-500", Icon: AlertCircle },
  CANCELLED: { label: "Cancelled", cls: "text-gray-500", Icon: XCircle },
  REFUNDED: { label: "Refunded", cls: "text-primary", Icon: RotateCcw },
};
/** A bank payment on its way (large bookings): not paid yet, not failed. */
const CLEARING = { label: "Processing", cls: "text-amber-500", Icon: Landmark };

/**
 * Customer's payment timeline for a booking with retry, confirm-work and report-a-problem actions.
 * `startReporting` opens the report form straight away (from the cancel dialog's no-show hint).
 */
export default function PaymentTimeline({ bookingId, bookingStatus, onChanged, startReporting }: { bookingId: string; bookingStatus: string; onChanged?: () => void; startReporting?: boolean }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(!!startReporting);
  // the installment being paid with another card, and the card picked
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);

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
      // already going through (the automatic retry got there first): not a failure, and the reload shows it
      if (e?.response?.status === 409) {
        toast.info(e.response.data?.message ?? "A payment is already going through.");
        await load();
      } else toast.error(e?.response?.data?.message ?? fail);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  if (!t) return null;

  const canApprove = bookingStatus === "COMPLETED" && !t.customer_approved_at && !t.released_at && !t.dispute;
  // a balance charged after the service: confirming charges it
  const balanceAfter = t.installments.filter((i) => i.after_service && i.status === "SCHEDULED" && i.attempts === 0).reduce((s, i) => s + i.amount, 0);
  // the API says when (it also allows a confirmed booking past its start: a no-show); older APIs don't
  const canDispute = t.can_dispute ?? (["IN_PROGRESS", "COMPLETED"].includes(bookingStatus) && !t.released_at && !t.dispute);
  // paid in one go through Checkout: no plan to show, only the report
  const hasPlan = t.installments.length > 0;
  if (!hasPlan && !canDispute && !t.dispute) return null;

  return (
    <section id="booking-payments" className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">Payments</h2>
        {t.plan && <p className="text-xs text-gray-500 dark:text-gray-400">{planText(t.plan, t.plan_label)}</p>}
      </div>

      {t.payment_state && t.payment_due_by && (
        <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="pay-by">
          {paymentStateText(t.payment_state)}: pay by {dueByText(t.payment_due_by)}, or the booking is cancelled.
        </p>
      )}

      {hasPlan && (
        <>
          <ul className="space-y-3">
            {t.installments.map((i) => {
              // a status this app doesn't know yet (a newer server) still reads sensibly
              const st = i.clearing ? CLEARING : (STATUS[i.status] ?? { label: paymentStatusText(i.status), cls: "text-gray-500", Icon: Clock });
              // a failed charge, or a missed deposit or balance waiting for its automatic retry: the customer can pay now
              const payable = i.status === "FAILED" || (!!t.payment_state && i.status === "SCHEDULED" && i.attempts > 0);
              return (
                <li key={i.id} className="flex items-start gap-3">
                  <st.Icon className={`w-5 h-5 mt-0.5 ${st.cls}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{i.label}</p>
                    <p className={`text-xs ${st.cls}`}>
                      {st.label}
                      {i.clearing ? ` · bank payment, clears in ${BANK_CLEARING_TEXT}` : ""}
                      {i.status === "PAID" && i.paid_at ? ` · ${dayjs(i.paid_at).format("MMM D")}` : ""}
                      {i.status === "SCHEDULED" && i.attempts === 0 ? (i.after_service ? " · after the service, once the work is confirmed" : ` · due ${dayjs(i.due_at).format("MMM D, YYYY")}`) : ""}
                      {i.status === "SCHEDULED" && i.attempts > 0 && i.next_attempt_at ? ` · retrying ${dayjs(i.next_attempt_at).format("MMM D, h:mm A")}` : ""}
                      {i.refunded_amount > 0 ? ` · ${money(i.refunded_amount)} refunded` : ""}
                    </p>
                    {i.last_error && i.status !== "PAID" && <p className="text-xs text-red-500">{i.last_error}</p>}
                    {payable && (
                      <div className="mt-1 space-y-2">
                        <div className="flex flex-wrap gap-3">
                          <button type="button" disabled={busy} onClick={() => run(() => PaymentsService.retry(bookingId, i.id), "Payment failed again")} className="text-xs font-semibold text-primary">
                            {t.payment_state ? `Pay ${money(i.amount)} now` : "Try again"}
                          </button>
                          <button type="button" onClick={() => setCardFor(cardFor === i.id ? null : i.id)} className="text-xs font-semibold text-primary">
                            {t.bank_allowed ? "Use another card or a bank account" : "Use another card"}
                          </button>
                        </div>
                        {cardFor === i.id && (
                          <div className="space-y-2">
                            <SavedCards selected={card} onSelect={setCard} allowBank={!!t.bank_allowed} />
                            <button
                              type="button"
                              disabled={!card || busy}
                              onClick={() => run(() => PaymentsService.retry(bookingId, i.id, card!), "Payment failed again").then(() => setCardFor(null))}
                              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60"
                            >
                              Pay {money(i.amount)} with this {t.bank_allowed ? "payment method" : "card"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{money(i.amount)}</span>
                </li>
              );
            })}
          </ul>

          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
            <span>Paid {money(t.paid)} of {money(t.total)}</span>
            {t.outstanding > 0 && <span>{money(t.outstanding)} to go{t.processing ? ` (${money(t.processing)} processing)` : ""}</span>}
          </div>
          {!!t.processing && t.processing > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 flex gap-2" data-testid="bank-processing">
              <Landmark className="w-4 h-4 flex-shrink-0" />
              Your bank payment of {money(t.processing)} is processing. Bank payments take {BANK_CLEARING_TEXT} to clear; the vendor is paid only once it has. If it doesn&apos;t go through, we&apos;ll let you know so you can pay another way.
            </p>
          )}
        </>
      )}

      {!!t.given_back && t.given_back > 0 && (
        <p className="text-xs text-green-600 flex gap-2"><RotateCcw className="w-4 h-4" />The vendor gave you {money(t.given_back)} back. It came off what you owe or was refunded to your card.</p>
      )}

      {t.dispute && !t.dispute.resolved_at ? (
        <p className="text-xs text-amber-600 flex gap-2"><ShieldCheck className="w-4 h-4" />You reported a problem on {dayjs(t.dispute.opened_at).format("MMM D")}. The vendor isn&apos;t paid until Vendly resolves it.</p>
      ) : t.released_at ? (
        <p className="text-xs text-green-600 flex gap-2"><CheckCircle2 className="w-4 h-4" />Paid to the vendor on {dayjs(t.released_at).format("MMM D, YYYY")}.</p>
      ) : t.release_at ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Vendly holds the money until {dayjs(t.release_at).format("MMM D, h:mm A")}. Confirm the work to pay the vendor sooner, or report a problem before then.</p>
      ) : t.paid > 0 ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Vendly holds your payment until the service is done.</p>
      ) : null}
      {canDispute && t.not_started && (
        <p className="text-xs text-amber-700 dark:text-amber-300 flex gap-2" data-testid="no-show-hint">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          The start time has passed and the vendor hasn’t started. If they didn’t show up, report a problem: your payment stays held while Vendly sorts it out.
        </p>
      )}

      {(canApprove || canDispute) && (
        <div className="flex flex-wrap items-center gap-3">
          {canApprove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm(balanceAfter > 0 ? `Confirm the work was done? The balance of ${money(balanceAfter)} is charged to your card and the vendor is paid.` : "Confirm the work was done and pay the vendor?") && run(() => PaymentsService.approve(bookingId), "Could not confirm")}
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
      {disputing && canDispute && (
        <ReportProblemForm
          bookingId={bookingId}
          paid={t.paid}
          limit={t.vendor_paid}
          category={t.not_started ? "no_show" : undefined}
          onCancel={() => setDisputing(false)}
          onSent={() => { setDisputing(false); load(); onChanged?.(); }}
        />
      )}
      {t.dispute && <YourReport bookingId={bookingId} />}
    </section>
  );
}

/** What the customer reported: kind of problem, what they asked for and their photos. */
function YourReport({ bookingId }: { bookingId: string }) {
  const [b, setB] = useState<(DisputeDetailFields & { dispute_reason?: string | null }) | null>(null);
  useEffect(() => {
    let live = true;
    BookingService.getOne(bookingId)
      .then((res) => live && setB(res.data?.data ?? null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [bookingId]);
  if (!b?.dispute_reason) return null;
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Your report</p>
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{b.dispute_reason}</p>
      <DisputeDetails d={b} who="You" />
    </div>
  );
}
