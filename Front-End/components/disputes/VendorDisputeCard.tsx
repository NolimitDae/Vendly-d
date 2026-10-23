"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import dayjs from "dayjs";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";

export interface DisputeFields {
  dispute_opened_at?: string | null;
  dispute_reason?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolution?: string | null;
  dispute_vendor_reply?: string | null;
  dispute_vendor_replied_at?: string | null;
}

const MIN = 10;
const MAX = 2000;

/** What the customer reported, that the payout is held, and the vendor's reply for Vendly. */
export default function VendorDisputeCard({ bookingId, booking, onChanged }: { bookingId: string; booking: DisputeFields; onChanged?: () => void }) {
  const [reply, setReply] = useState(booking.dispute_vendor_reply ?? "");
  const [editing, setEditing] = useState(!booking.dispute_vendor_reply);
  const [saving, setSaving] = useState(false);
  if (!booking.dispute_opened_at) return null;
  const open = !booking.dispute_resolved_at;

  const send = async () => {
    const text = reply.trim();
    if (text.length < MIN) return toast.error(`Write at least ${MIN} characters.`);
    setSaving(true);
    try {
      await BookingService.replyToDispute(bookingId, text);
      toast.success("Sent to Vendly");
      setEditing(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn’t send your reply. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Problem reported" className={`rounded-xl p-5 border space-y-3 ${open ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700"}`}>
      <div className="flex items-center gap-2">
        {open ? <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden /> : <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden />}
        <h2 className="font-semibold text-gray-900 dark:text-white">{open ? "The customer reported a problem" : "Problem resolved"}</h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Reported {dayjs(booking.dispute_opened_at).format("MMM D, YYYY h:mm A")}</p>
      {booking.dispute_reason && (
        <blockquote className="text-sm text-gray-800 dark:text-gray-200 border-l-4 border-amber-300 dark:border-amber-700 pl-3 whitespace-pre-wrap">{booking.dispute_reason}</blockquote>
      )}
      {open ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">Your payment for this booking is held until Vendly reviews it. Give your side below; photos you’ve uploaded as proof are seen by Vendly too.</p>
      ) : (
        booking.dispute_resolution && <p className="text-sm text-gray-700 dark:text-gray-300">Vendly’s decision: {booking.dispute_resolution.replace(/ by admin [^:]+:/, ":")}</p>
      )}

      {open && editing && (
        <div className="space-y-2">
          <label htmlFor="dispute-reply" className="text-sm font-medium text-gray-800 dark:text-gray-200">Your side</label>
          <textarea
            id="dispute-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, MAX))}
            rows={4}
            placeholder="What happened, and anything Vendly should know"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">{reply.trim().length}/{MAX}</span>
            <button type="button" onClick={send} disabled={saving || reply.trim().length < MIN} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send to Vendly
            </button>
          </div>
        </div>
      )}
      {(!open || !editing) && booking.dispute_vendor_reply && (
        <div className="text-sm space-y-1">
          <p className="font-medium text-gray-800 dark:text-gray-200">Your reply{booking.dispute_vendor_replied_at ? ` · ${dayjs(booking.dispute_vendor_replied_at).format("MMM D, h:mm A")}` : ""}</p>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{booking.dispute_vendor_reply}</p>
          {open && (
            <button type="button" onClick={() => setEditing(true)} className="text-primary font-medium">Edit reply</button>
          )}
        </div>
      )}
    </section>
  );
}
