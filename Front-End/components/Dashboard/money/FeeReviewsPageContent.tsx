"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { BookingExtrasService, type AdminExtra } from "@/service/add-ons/add-ons.service";
import { apiError } from "@/service/contracts/contracts.service";
import { DisputeContract } from "./DisputesPageContent";

const money = (n: number | string) => "$" + Number(n).toFixed(2);

const OUTCOME: Record<string, string> = {
  APPROVED: "Charged",
  WAIVED: "Waived",
  CANCELLED: "Withdrawn by the vendor",
  DECLINED: "Declined",
  PENDING: "Waiting for the customer",
};

/** Admin queue of fees vendors asked Vendly to review: charge the customer's card or waive it. */
export default function FeeReviewsPageContent() {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [rows, setRows] = useState<AdminExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await BookingExtrasService.adminList(tab);
      setRows(res.data?.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const decide = async (e: AdminExtra, action: "charge" | "waive") => {
    if (note.trim().length < 3) return toast.error("Add a short note explaining the decision");
    if (!confirm(action === "charge" ? `Charge ${money(e.total)} to the customer's card?` : `Waive the ${e.name} fee? The customer won't pay it.`)) return;
    setBusy(true);
    try {
      const res = await BookingExtrasService.adminReview(e.id, action, note.trim());
      const paid = res.data?.data?.paid;
      toast.success(action === "waive" ? "Fee waived; both sides were emailed" : paid ? "Fee charged; both sides were emailed" : "Marked as owed, but the charge didn't go through yet");
      setOpen(null);
      setNote("");
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save the decision"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["open", "done"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
            {t === "open" ? "Waiting" : "Decided"}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{tab === "open" ? "No fees waiting for review." : "No decided fee reviews yet."}</p>
      ) : (
        rows.map((e) => (
          <div key={e.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{e.label}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">{e.booking.listing?.title ?? "Booking"}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Customer {e.booking.customer.name} ({e.booking.customer.email}) · Vendor {e.booking.vendor.name} ({e.booking.vendor.email})
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{money(e.total)}</p>
                {e.review_requested_at && <p className="text-xs text-gray-500">Sent {dayjs(e.review_requested_at).format("MMM D, YYYY")}</p>}
              </div>
            </div>
            <dl className="text-sm space-y-2">
              {e.note && (
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Vendor&apos;s reason to the customer</dt>
                  <dd className="text-gray-700 dark:text-gray-200">{e.note}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">Customer&apos;s decline reason</dt>
                <dd className="text-gray-700 dark:text-gray-200">{e.decline_reason || (e.responded_at ? "No reason given" : "The customer didn't answer")}</dd>
              </div>
              {e.review_note && (
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Vendor&apos;s note to Vendly{e.reviewed_at ? " and the decision" : ""}</dt>
                  <dd className="text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3 whitespace-pre-line">{e.review_note}</dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Booking {e.booking.status}
              {e.booking.completed_at ? ` · completed ${dayjs(e.booking.completed_at).format("MMM D")}` : ""} · {e.booking.has_proof ? "vendor uploaded proof photos" : "no proof photos"}
              {tab === "done" ? ` · ${OUTCOME[e.status] ?? e.status}${e.reviewed_at ? ` ${dayjs(e.reviewed_at).format("MMM D")}` : ""}` : ""}
            </p>
            <DisputeContract bookingId={e.booking.id} />

            {tab === "open" &&
              (open === e.id ? (
                <div className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <textarea
                    aria-label="Decision note"
                    rows={2}
                    placeholder="Note for the record (both sides see it in the email)"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setOpen(null); setNote(""); }} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
                    <button onClick={() => decide(e, "waive")} disabled={busy} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold disabled:opacity-60">Waive</button>
                    <button onClick={() => decide(e, "charge")} disabled={busy} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Charge {money(e.total)}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpen(e.id); setNote(""); }} className="text-sm font-semibold text-primary">Decide</button>
              ))}
          </div>
        ))
      )}
    </div>
  );
}
