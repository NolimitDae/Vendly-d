"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";
import { ContractsService, apiError, type SignaturePayload } from "@/service/contracts/contracts.service";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import { cn } from "@/lib/utils";
import { money, paymentStatusText, planError, planPayload, startingPlan, whenText, type PlanDraftRow, type PlanRow } from "@/lib/payment-plan";
import PaymentPlanEditor from "./PaymentPlanEditor";

export interface PaymentPlanState {
  role: "VENDOR" | "CUSTOMER";
  plan: string | null;
  payments: PlanRow[];
  can_propose: boolean;
  cannot_propose_reason: string | null;
  rules: { owed: number; fee_owed: number; paid_count: number; min_payments: number; max_payments: number; min_payment: number; latest_due_at: string; event_start_at: string | null; pay_after: boolean } | null;
  proposal: {
    contract_id: string;
    status: "WAITING" | "APPROVED" | "DECLINED" | "WITHDRAWN";
    sent_at: string;
    vendor_name: string;
    note: string | null;
    owed: number;
    before: PlanRow[];
    after: PlanRow[];
    content_sha256: string;
  } | null;
  consent_text: string;
}

interface Props {
  bookingId: string;
  role: "VENDOR" | "CUSTOMER";
  bookingStatus: string;
  /** the other side's name, for the messages */
  otherName: string;
  defaultName?: string;
  onChanged?: () => void;
}

const box = "bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4";
const STATUS_CLS: Record<string, string> = { PAID: "text-green-600", FAILED: "text-red-500", PROCESSING: "text-amber-600", REFUNDED: "text-primary" };

/** A list of payments: what, when, how much, and where each stands. */
export function PaymentRows({ rows, firstLabel, label }: { rows: PlanRow[]; firstLabel: string; label: string }) {
  return (
    <ul className="space-y-1.5" aria-label={label}>
      {rows.map((r, k) => (
        <li key={`${r.label}-${k}`} className="flex items-start justify-between gap-3 text-sm">
          <span>
            <span className="block text-gray-900 dark:text-white">{r.label}</span>
            <span className={cn("block text-xs text-gray-500 dark:text-gray-400", r.status && STATUS_CLS[r.status])}>
              {whenText(r.due_at, firstLabel)}
              {r.status ? ` · ${paymentStatusText(r.status)}` : ""}
            </span>
          </span>
          <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{money(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The current payments next to the proposed ones. Paid payments stay; the rest are replaced. */
export function PlanComparison({ before, after, firstLabel }: { before: PlanRow[]; after: PlanRow[]; firstLabel: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Now</p>
        <PaymentRows rows={before} firstLabel={firstLabel} label="Current payments" />
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-xs font-semibold text-primary">With the new plan</p>
        <PaymentRows rows={[...before.filter((r) => r.status === "PAID" || r.status === "REFUNDED"), ...after]} firstLabel={firstLabel} label="Payments with the new plan" />
      </div>
    </div>
  );
}

/**
 * A custom payment plan on a confirmed booking. The vendor sees the schedule and can propose a new plan
 * for what's left (signed as an amendment); the customer sees the proposal, before and after, and signs to
 * agree or declines (the current payments stay).
 */
export default function PaymentPlanCard({ bookingId, role, bookingStatus, otherName, defaultName, onChanged }: Props) {
  const [state, setState] = useState<PaymentPlanState | null>(null);
  const [rows, setRows] = useState<PlanDraftRow[] | null>(null);
  const [note, setNote] = useState("");
  const [review, setReview] = useState<null | { title: string; body: string; content_sha256: string; consent_text: string; source_pdf_url?: string | null }>(null);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(bookingStatus);

  const load = useCallback(async () => {
    try {
      const res = await BookingService.paymentPlan(bookingId);
      setState(res.data.data);
    } catch {
      setState(null);
    }
  }, [bookingId]);

  useEffect(() => {
    if (shown) load();
  }, [load, shown]);

  if (!shown || !state) return null;
  const p = state.proposal;
  const waiting = p?.status === "WAITING" ? p : null;
  const done = async () => {
    setRows(null);
    setReview(null);
    setNote("");
    await load();
    onChanged?.();
  };
  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await done();
    } catch (err) {
      toast.error(apiError(err, fail));
    } finally {
      setBusy(false);
    }
  };

  // ─── Customer ──────────────────────────────────────────────────────────────
  if (role === "CUSTOMER") {
    if (!p) return null;
    const openSign = async () => {
      setBusy(true);
      try {
        const c = (await ContractsService.get(p.contract_id)).data.data;
        const source = c.has_source_pdf ? (await ContractsService.downloadLink(p.contract_id, "source")).data.data.url : null;
        setReview({ title: c.title, body: c.body, content_sha256: c.content_sha256, consent_text: c.consent_text, source_pdf_url: source });
      } catch (err) {
        toast.error(apiError(err, "Couldn't open the contract"));
      } finally {
        setBusy(false);
      }
    };
    const decline = () => {
      const reason = window.prompt("Decline the payment plan? Your payments stay as they are. A reason for the vendor (optional):");
      if (reason === null) return;
      run(() => BookingService.declinePaymentPlan(bookingId, reason.trim() || undefined), "Payment plan declined. Your payments stay as they were.", "Couldn't decline the plan");
    };
    return (
      <section className={box} aria-labelledby="payment-plan">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" aria-hidden />
          <h2 id="payment-plan" className="font-semibold text-gray-900 dark:text-white">
            {waiting ? `${p.vendor_name} proposed a payment plan` : "Payment plan"}
          </h2>
        </div>
        {waiting ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {p.vendor_name} would like you to pay the {money(p.owed)} still owed in {p.after.length} payments, each charged on its date to your saved card. Sign to agree, or decline to keep your current payments.
            </p>
            {p.note && (
              <blockquote className="rounded-xl bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Note from {p.vendor_name}</span>
                {p.note}
              </blockquote>
            )}
            <PlanComparison before={p.before} after={p.after} firstLabel="When you agree" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Payments you’ve made stay as they are. If you cancel, the first payment you made stays with the vendor as the deposit; the rest follows the cancellation policy.
            </p>
            {review ? (
              <SignContractPanel
                title={review.title}
                body={review.body}
                contentSha256={review.content_sha256}
                consentText={review.consent_text}
                sourcePdfUrl={review.source_pdf_url}
                defaultName={defaultName}
                submitLabel="Sign and agree"
                busy={busy}
                onSubmit={(signature: SignaturePayload) => run(() => BookingService.approvePaymentPlan(bookingId, signature), "Payment plan agreed. Each payment is charged on its date.", "Couldn't agree to the plan")}
                onCancel={() => setReview(null)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={openSign} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  Review and sign
                </button>
                <button type="button" onClick={decline} disabled={busy} className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 disabled:opacity-60">
                  Decline plan
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {p.status === "APPROVED"
              ? "You agreed to the payment plan. Each payment is charged on its date; see Payments."
              : p.status === "DECLINED"
                ? "You declined the payment plan. Your payments stayed as they were."
                : `${p.vendor_name} withdrew the payment plan they proposed. Your payments stayed as they were.`}
          </p>
        )}
      </section>
    );
  }

  // ─── Vendor ────────────────────────────────────────────────────────────────
  const rules = state.rules;
  const latest = rules?.latest_due_at ?? null;
  const problem = rows && rules ? planError(rows, rules.owed, { feeOwed: rules.fee_owed, latest }) : null;
  const body = () => ({ ...planPayload(rows ?? [], rules?.event_start_at), ...(note.trim() ? { note: note.trim() } : {}) });
  const toReview = async () => {
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const [res, mine] = await Promise.all([BookingService.previewPaymentPlan(bookingId, body()), ContractsService.vendorList().catch(() => null)]);
      const d = res.data.data;
      if (d.missing_message) return toast.error(d.missing_message);
      setHasSavedSignature(!!mine?.data?.data?.has_saved_signature);
      setReview(d);
    } catch (err) {
      toast.error(apiError(err, "Couldn't check the plan"));
    } finally {
      setBusy(false);
    }
  };
  const send = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.proposePaymentPlan(bookingId, body(), signature);
      toast.success(`Payment plan sent to ${otherName}`);
      await done();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info("Something changed since you reviewed it. Please check the plan again.");
        setReview(null);
      } else toast.error(apiError(err, "Couldn't send the plan"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={box} aria-labelledby="payment-plan">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-primary" aria-hidden />
        <h2 id="payment-plan" className="font-semibold text-gray-900 dark:text-white">
          Payment schedule
        </h2>
      </div>
      {state.payments.length > 0 ? (
        <PaymentRows rows={state.payments} firstLabel="When accepted" label="Payments on this booking" />
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">This booking was paid in one go.</p>
      )}

      {waiting && (
        <>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
            Your payment plan is waiting for {otherName}. Until they sign it, the payments above stay as they are.
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-700 dark:text-gray-300">What you proposed</summary>
            <div className="mt-3">
              <PlanComparison before={waiting.before} after={waiting.after} firstLabel="When they agree" />
            </div>
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm("Withdraw your payment plan? The current payments stay.") && run(() => BookingService.withdrawPaymentPlan(bookingId), "Payment plan withdrawn", "Couldn't withdraw the plan")}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-60"
          >
            Withdraw plan
          </button>
        </>
      )}
      {p?.status === "DECLINED" && !rows && <p className="text-sm text-gray-600 dark:text-gray-300">{otherName} declined your payment plan. The payments stayed as they were.</p>}
      {p?.status === "APPROVED" && !rows && <p className="text-sm text-gray-600 dark:text-gray-300">{otherName} agreed to your payment plan. Each payment is charged on its date.</p>}

      {state.can_propose && rules && !rows && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {money(rules.owed)} is still to be paid. You can offer {otherName} a plan that splits it into payments on dates you choose; they sign to agree.
          </p>
          <button
            type="button"
            onClick={() => setRows(startingPlan(rules.owed, rules.event_start_at))}
            className="px-4 py-2 rounded-lg border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5"
          >
            Propose a payment plan
          </button>
        </div>
      )}

      {rows && rules && (
        <div className="space-y-4">
          {review ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Sign the amendment with the new plan. {otherName} reviews it and signs to agree, or declines.</p>
              <SignContractPanel
                title={review.title}
                body={review.body}
                contentSha256={review.content_sha256}
                consentText={review.consent_text}
                vendor={{ hasSavedSignature }}
                submitLabel="Sign and send"
                busy={busy}
                onSubmit={send}
                onCancel={() => setReview(null)}
              />
            </>
          ) : (
            <>
              <PaymentPlanEditor rows={rows} onChange={setRows} total={rules.owed} feeOwed={rules.fee_owed} firstLabel="When they agree" latest={latest} />
              <label className="block text-sm text-gray-700 dark:text-gray-300">
                Note to {otherName} (optional)
                <textarea
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none"
                />
              </label>
              {problem && <p className="text-sm text-amber-700 dark:text-amber-300">{problem}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setRows(null)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={toReview}
                  disabled={busy || !!problem}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  Review and sign
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!state.can_propose && !waiting && !rows && state.cannot_propose_reason && bookingStatus === "CONFIRMED" && state.payments.some((r) => r.status === "SCHEDULED" || r.status === "FAILED") && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{state.cannot_propose_reason}</p>
      )}
    </section>
  );
}
