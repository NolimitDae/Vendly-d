"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Package, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import { RentalsService, errorMessage, money } from "@/service/rentals/rentals.service";
import { FILE_INPUT_CLASS } from "@/lib/file-input";

export interface RentalBookingFields {
  id: string;
  status: string;
  is_rental?: boolean;
  security_deposit?: number | string | null;
  rental_reservations?: { id: string; quantity: number; start_date: string; end_date: string; item: { id: string; title: string } }[];
  rental_return?: { damage_fee: number | string; late_fee: number | string; notes?: string | null; created_at: string } | null;
}

const fmt = (s: string) => new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** Rented items on a booking, plus the vendor's return check-in (or its outcome for the customer). */
export default function RentalReturnPanel({ booking, role, onChanged }: { booking: RentalBookingFields; role: "VENDOR" | "CUSTOMER"; onChanged?: () => void }) {
  const [reporting, setReporting] = useState(false);
  const [damage, setDamage] = useState("");
  const [late, setLate] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  if (!booking.is_rental || !booking.rental_reservations?.length) return null;
  const res = booking.rental_reservations;
  const deposit = Number(booking.security_deposit ?? 0);
  const ret = booking.rental_return;
  const active = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status);

  const submit = async () => {
    const d = Number(damage || 0);
    const l = Number(late || 0);
    if (Number.isNaN(d) || Number.isNaN(l) || d < 0 || l < 0) return toast.error("Enter fees in dollars, or leave them empty");
    if ((d > 0 || l > 0) && !photos.length && !notes.trim()) return toast.error("Add photos or a note explaining the fees");
    const fees = d + l;
    const msg = fees > 0
      ? (deposit
        ? `Up to ${money(deposit)} comes from the customer's deposit hold (they can dispute within 48 hours).${fees > deposit ? ` The other ${money(fees - deposit)} is sent to them to approve before it's charged.` : ""}`
        : `${money(fees)} is sent to the customer to approve before it's charged.`)
      : "The customer's deposit hold will be released.";
    if (!confirm(`Record the return? ${msg}`)) return;
    setBusy(true);
    try {
      await RentalsService.recordReturn(booking.id, { damage_fee: d || undefined, late_fee: l || undefined, notes: notes.trim() || undefined, photos });
      toast.success("Return recorded");
      onChanged?.();
    } catch (e) {
      toast.error(errorMessage(e, "Could not record the return"));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Rented items</h2>
      </div>
      <ul className="space-y-1.5 text-sm">
        {res.map((r) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className="text-gray-800 dark:text-gray-200"><span className="font-semibold text-primary">{r.quantity}×</span> {r.item.title}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-500 dark:text-gray-400">{fmt(res[0].start_date)} → {fmt(res[0].end_date)}</p>

      {ret ? (
        (() => {
          const fees = Number(ret.damage_fee) + Number(ret.late_fee);
          return (
            <div className={`rounded-lg p-3 text-sm space-y-1 ${fees > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
              <p className="font-medium flex items-center gap-1.5 text-gray-900 dark:text-white">
                {fees > 0 ? <AlertCircle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                Returned {fmt(ret.created_at)}
              </p>
              {fees > 0 ? (
                <>
                  {Number(ret.damage_fee) > 0 && <p>Damage fee: {money(ret.damage_fee)}</p>}
                  {Number(ret.late_fee) > 0 && <p>Late fee: {money(ret.late_fee)}</p>}
                  {ret.notes && <p className="text-gray-500 dark:text-gray-400">“{ret.notes}”</p>}
                  {role === "CUSTOMER" && <p className="text-gray-500 dark:text-gray-400">Taken from your deposit hold first. Disagree? Open a dispute within 48 hours.</p>}
                </>
              ) : (
                <p className="text-gray-600 dark:text-gray-300">{role === "CUSTOMER" ? "Everything came back fine. Your deposit hold has been released." : "No fees. The customer's deposit hold was released."}</p>
              )}
            </div>
          );
        })()
      ) : role === "CUSTOMER" ? (
        deposit > 0 && active && (
          <p className="text-sm text-gray-600 dark:text-gray-300 flex gap-2">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            A {money(deposit)} security deposit is held on your card the day before pickup and released when the vendor checks the items back in, unless they report damage or a late return.
          </p>
        )
      ) : active ? (
        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5"><RotateCcw className="w-4 h-4 text-primary" /> Check items back in</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">You are paid once the return is recorded{deposit ? `, and the customer's ${money(deposit)} deposit hold is released unless you add fees` : ""}.</p>
          {!reporting ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Everything came back OK
              </button>
              <button onClick={() => setReporting(true)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Report damage or a late return</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm"><span className="text-gray-600 dark:text-gray-300">Damage fee ($)</span><input className={input} inputMode="decimal" value={damage} onChange={(e) => setDamage(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
                <label className="text-sm"><span className="text-gray-600 dark:text-gray-300">Late fee ($)</span><input className={input} inputMode="decimal" value={late} onChange={(e) => setLate(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
              </div>
              <label className="block text-sm"><span className="text-gray-600 dark:text-gray-300">What happened?</span><textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 chairs returned with broken legs" /></label>
              <input type="file" accept="image/*" multiple aria-label="Return photos" onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 10))} className={FILE_INPUT_CLASS} />
              <div className="flex gap-2">
                <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Record return
                </button>
                <button onClick={() => setReporting(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
