"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "react-toastify";
import {
  DISPUTE_CATEGORY_LABELS,
  DISPUTE_MAX_PHOTOS,
  DISPUTE_OUTCOME_LABELS,
  PaymentsService,
  type DisputeCategory,
  type DisputeOutcome,
} from "@/service/payments/payments.service";

const MIN = 10;
const MAX = 2000;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

interface Picked {
  file: File;
  url: string;
}

/**
 * The customer's report: what kind of problem, what happened, photos, and what they'd like Vendly to do.
 * `limit` (the vendor's part of what was paid, from newer APIs) keeps a partial refund under what
 * Vendly can grant; `category` preselects the kind of problem (a no-show).
 */
export default function ReportProblemForm({ bookingId, paid, limit, category: initialCategory, onCancel, onSent }: { bookingId: string; paid: number; limit?: number | null; category?: DisputeCategory; onCancel: () => void; onSent: () => void }) {
  const [category, setCategory] = useState<DisputeCategory | "">(initialCategory ?? "");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [outcome, setOutcome] = useState<DisputeOutcome>("full_refund");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  // previews are object URLs; free them when the form goes away
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | null) => {
    if (!list) return;
    const room = DISPUTE_MAX_PHOTOS - photos.length;
    const files = Array.from(list);
    const ok = files.filter((f) => ACCEPT.split(",").includes(f.type) && f.size <= MAX_BYTES);
    if (ok.length < files.length) toast.error("Photos must be JPEG, PNG, WebP or GIF, under 10 MB each.");
    if (ok.length > room) toast.error(`You can add up to ${DISPUTE_MAX_PHOTOS} photos.`);
    const next = ok.slice(0, Math.max(0, room)).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    setPhotos((p) => [...p, ...next]);
    if (input.current) input.current.value = "";
  };

  const remove = (i: number) => {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].url);
      return p.filter((_, j) => j !== i);
    });
  };

  const requested = Number(amount);
  const cap = limit ?? null;
  const amountError =
    outcome !== "partial_refund"
      ? ""
      : !(requested > 0)
        ? "Enter how much you’d like back."
        : cap !== null && requested >= cap
          ? `A partial refund must be less than $${cap.toFixed(2)}, the vendor’s part of what you’ve paid. To ask for everything back, choose a full refund.`
          : cap === null && requested > paid
            ? `You can ask for up to $${paid.toFixed(2)}, what you’ve paid.`
            : "";
  const valid = !!category && reason.trim().length >= MIN && !amountError;

  const send = async () => {
    if (!valid || !category) return;
    setSending(true);
    try {
      await PaymentsService.dispute(bookingId, {
        reason: reason.trim(),
        category,
        outcome,
        requested_amount: outcome === "partial_refund" ? Math.round(requested * 100) / 100 : undefined,
        photos: photos.map((p) => p.file),
      });
      toast.success("Sent to Vendly. The vendor isn’t paid until it’s resolved.");
      onSent();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn’t send your report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      aria-label="Report a problem"
      className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="space-y-1">
        <label htmlFor="dispute-category" className="text-sm font-medium text-gray-800 dark:text-gray-200">What went wrong?</label>
        <select
          id="dispute-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as DisputeCategory)}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-white"
        >
          <option value="" disabled>Choose one</option>
          {(Object.keys(DISPUTE_CATEGORY_LABELS) as DisputeCategory[]).map((c) => (
            <option key={c} value={c}>{DISPUTE_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="dispute-reason" className="text-sm font-medium text-gray-800 dark:text-gray-200">Tell us what happened</label>
        <textarea
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX))}
          rows={4}
          placeholder="What happened, when, and anything Vendly should know (at least 10 characters)"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
        <p className="text-xs text-gray-400 text-right">{reason.trim().length}/{MAX}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Photos <span className="font-normal text-gray-500">(optional, up to {DISPUTE_MAX_PHOTOS})</span></p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative w-20 h-20">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={p.url} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900/80 text-white flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {photos.length < DISPUTE_MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400"
            >
              <ImagePlus className="w-5 h-5" aria-hidden />
              Add
            </button>
          )}
        </div>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden aria-label="Add photos" onChange={(e) => add(e.target.files)} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">What would you like?</legend>
        {(Object.keys(DISPUTE_OUTCOME_LABELS) as DisputeOutcome[]).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="radio" name="dispute-outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="accent-primary" />
            {DISPUTE_OUTCOME_LABELS[o]}
          </label>
        ))}
        {outcome === "partial_refund" && (
          <div className="pl-6 space-y-1">
            <label htmlFor="dispute-amount" className="text-xs text-gray-500 dark:text-gray-400">
              {cap !== null ? `Amount (less than $${cap.toFixed(2)})` : `Amount (up to $${paid.toFixed(2)})`}
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">$</span>
              <input
                id="dispute-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-32 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-white"
              />
            </div>
            {amount !== "" && amountError && <p className="text-xs text-red-500">{amountError}</p>}
          </div>
        )}
      </fieldset>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
        <button type="submit" disabled={sending || !valid} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
          {sending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send report
        </button>
      </div>
    </form>
  );
}
