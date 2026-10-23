"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { MoneyService, type Dispute } from "@/service/admin/money.service";
import { ContractsService, apiError } from "@/service/contracts/contracts.service";
import AdminContractCard from "@/components/contracts/AdminContractCard";

const money = (n: number | string) => "$" + Number(n).toFixed(2);

/** Admin queue of bookings where the customer reported a problem; the money is held until resolved. */
export default function DisputesPageContent() {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState<"refund" | "partial_refund" | "release">("release");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await MoneyService.disputes(tab);
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

  const resolve = async (d: Dispute) => {
    if (note.trim().length < 5) return toast.error("Add a short note explaining the decision");
    if (action === "partial_refund" && !(Number(amount) > 0 && Number(amount) < d.paid)) return toast.error(`Refund must be between $0 and ${money(d.paid)}`);
    if (!confirm(action === "release" ? "Release the payment to the vendor?" : `Refund ${action === "refund" ? money(d.paid) : money(amount)} to the customer?`)) return;
    setBusy(true);
    try {
      await MoneyService.resolveDispute(d.id, { action, amount: action === "partial_refund" ? Number(amount) : undefined, note: note.trim() });
      toast.success("Dispute resolved; both sides were emailed");
      setOpen(null);
      setNote("");
      setAmount("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't resolve");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["open", "resolved"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
            {t === "open" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">{tab === "open" ? "No open disputes." : "No resolved disputes yet."}</p>
      ) : (
        rows.map((d) => (
          <div key={d.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{d.listing?.title ?? "Booking"}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {d.customer.name} ({d.customer.email}) vs {d.vendor.name} ({d.vendor.email})
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{money(d.paid)} held</p>
                <p className="text-xs text-gray-500">Opened {dayjs(d.dispute_opened_at).format("MMM D, YYYY")}</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">“{d.dispute_reason}”</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Status {d.status}
              {d.completed_at ? ` · completed ${dayjs(d.completed_at).format("MMM D")}` : ""} · {d.has_proof ? "vendor uploaded proof photos" : "no proof photos"}
            </p>
            {d.dispute_resolution && <p className="text-xs text-green-600">Resolved: {d.dispute_resolution}</p>}
            <DisputeContract bookingId={d.id} />

            {tab === "open" &&
              (open === d.id ? (
                <div className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["release", "Release to vendor"],
                      ["partial_refund", "Partial refund"],
                      ["refund", "Full refund"],
                    ] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setAction(v)} className={`px-3 py-1.5 rounded-full text-sm ${action === v ? "bg-primary text-primary-foreground" : "border border-gray-200 dark:border-gray-700"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {action === "partial_refund" && (
                    <input aria-label="Refund amount" placeholder={`Amount to refund (max ${money(d.paid)})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full h-10 px-4 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                  )}
                  <textarea aria-label="Decision note" rows={2} placeholder="Note for the record (both sides see it in the email)" value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(null)} className="px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
                    <button onClick={() => resolve(d)} disabled={busy} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">Resolve</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setOpen(d.id); setAction("release"); }} className="text-sm font-semibold text-primary">Decide</button>
              ))}
          </div>
        ))
      )}
    </div>
  );
}

/** The booking's signed contract, loaded on demand (admin views are recorded in its audit log). */
function DisputeContract({ bookingId }: { bookingId: string }) {
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    if (shown) return setShown(false);
    setShown(true);
    if (contracts) return;
    setLoading(true);
    setError("");
    try {
      const res = await ContractsService.adminBooking(bookingId);
      setContracts(res.data?.data ?? []);
    } catch (e) {
      setError(apiError(e, "No contract for this booking."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={toggle} aria-expanded={shown} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        <FileText className="w-4 h-4" aria-hidden />
        {shown ? "Hide contract" : "View contract"}
      </button>
      {shown &&
        (loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : error ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        ) : (
          contracts?.map((c) => <AdminContractCard key={c.id} contract={c} onError={(m) => toast.error(m)} />)
        ))}
    </div>
  );
}
