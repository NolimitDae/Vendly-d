"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";
import { BookingService } from "@/service/booking/booking.service";
import { ContractsService, apiError, type SignaturePayload } from "@/service/contracts/contracts.service";
import { togglePick } from "@/lib/package-options";
import {
  countsQuantity,
  draftError,
  draftFrom,
  draftPayload,
  lineFor,
  MAX_NOTE,
  money,
  unitWord,
  type ChangesState,
  type Comparison,
  type Draft,
} from "@/lib/request-changes";
import SignContractPanel from "@/components/contracts/SignContractPanel";
import ChangesComparison from "./ChangesComparison";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

interface Review extends Comparison {
  title: string;
  body: string;
  content_sha256: string;
  consent_text: string;
  missing_message: string | null;
}

interface Props {
  bookingId: string;
  editor: NonNullable<ChangesState["editor"]>;
  customerName: string;
  onClose: () => void;
  onSent: () => void;
}

/**
 * The vendor's editor for a request: date and time, guests, add-ons and fees (quantity and a price per
 * line for this booking), customizations and a note. "Review" shows the server's new total and the
 * updated contract; the vendor signs it and it goes to the customer to approve.
 */
export default function SuggestChangesDialog({ bookingId, editor, customerName, onClose, onSent }: Props) {
  const initial = useMemo(() => draftFrom(editor.current), [editor]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [review, setReview] = useState<Review | null>(null);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (key: string, patch: Partial<Draft["lines"][number]>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const used = new Set(draft.lines.map((l) => l.add_on_id).filter(Boolean));
  const keptAddOns = new Set(editor.current.lines.filter((l) => draft.lines.some((d) => d.extra_id === l.extra_id)).map((l) => l.add_on_id));
  const addable = [...editor.add_ons, ...editor.fees].filter((a) => !used.has(a.id) && !keptAddOns.has(a.id));
  const problem = draftError(draft, { needsGuests: editor.needs_guest_count, customizations: editor.customizations });
  const body = () => draftPayload(draft, initial, editor.customizations);

  const toReview = async () => {
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const [res, mine] = await Promise.all([BookingService.previewChanges(bookingId, body()), ContractsService.vendorList().catch(() => null)]);
      const d: Review = res.data.data;
      if (d.missing_message) return toast.error(d.missing_message);
      setHasSavedSignature(!!mine?.data?.data?.has_saved_signature);
      setReview(d);
    } catch (err) {
      toast.error(apiError(err, "Couldn't work out the changes"));
    } finally {
      setBusy(false);
    }
  };

  const send = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.sendChanges(bookingId, body(), signature);
      toast.success(`Changes sent to ${customerName}`);
      onSent();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.info("Something changed since you reviewed it. Please check the changes again.");
        setReview(null);
      } else {
        toast.error(apiError(err, "Couldn't send the changes"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="suggest-changes-title">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onClose()} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 z-10 space-y-5">
        <div className="flex items-center justify-between">
          <h3 id="suggest-changes-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {review ? "Review and sign" : "Suggest changes"}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {review ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Check the new total, then sign the updated contract. {customerName} reviews it and approves or declines; you then Accept &amp; Sign as usual.
            </p>
            <ChangesComparison comparison={review} />
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
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Change what you need. The package price stays the same; {customerName} sees what changed and approves or declines.
            </p>

            <section className="space-y-3" aria-labelledby="changes-when">
              <h4 id="changes-when" className="text-sm font-semibold text-gray-900 dark:text-white">When</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Date
                  <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Start
                  <input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  End
                  <input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} className={`${inputCls} mt-1`} />
                </label>
              </div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 max-w-[12rem]">
                Guests{editor.needs_guest_count ? " (required)" : ""}
                <input type="number" min={1} inputMode="numeric" value={draft.guests} onChange={(e) => set({ guests: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
            </section>

            <section className="space-y-3" aria-labelledby="changes-extras">
              <h4 id="changes-extras" className="text-sm font-semibold text-gray-900 dark:text-white">Add-ons and fees</h4>
              {!draft.lines.length && <p className="text-sm text-gray-500 dark:text-gray-400">None on this request.</p>}
              <ul className="space-y-2">
                {draft.lines.map((l) => (
                  <li key={l.key} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {l.name}
                        {l.kind === "FEE" && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">Fee</span>}
                      </p>
                      <button
                        type="button"
                        onClick={() => set({ lines: draft.lines.filter((x) => x.key !== l.key) })}
                        aria-label={`Remove ${l.name}`}
                        className="p-1.5 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-gray-600 dark:text-gray-300">
                        Price {unitWord(l.price_unit)} for this booking
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={l.unit_price}
                          onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                          className={`${inputCls} mt-1 w-32`}
                        />
                      </label>
                      {countsQuantity(l.price_unit) ? (
                        <label className="text-xs text-gray-600 dark:text-gray-300">
                          Quantity
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={l.quantity}
                            onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                            className={`${inputCls} mt-1 w-24`}
                          />
                        </label>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 pb-2">Counted on the {l.price_unit === "PER_PERSON" ? "guests" : "hours"}</p>
                      )}
                      {Number(l.unit_price) !== l.usual_price && <p className="text-xs text-gray-500 dark:text-gray-400 pb-2">Was {money(l.usual_price)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              {addable.length > 0 && (
                <div className="flex gap-2">
                  <label htmlFor="add-extra" className="sr-only">
                    Add an add-on or fee
                  </label>
                  <select id="add-extra" value={adding} onChange={(e) => setAdding(e.target.value)} className={inputCls}>
                    <option value="">Add an add-on or fee</option>
                    {addable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kind === "FEE" ? "Fee: " : ""}
                        {a.name} ({money(a.price)} {unitWord(a.price_unit)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!adding}
                    onClick={() => {
                      const item = addable.find((a) => a.id === adding);
                      if (item) set({ lines: [...draft.lines, lineFor(item)] });
                      setAdding("");
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              )}
            </section>

            {editor.customizations.length > 0 && (
              <section className="space-y-3" aria-labelledby="changes-custom">
                <h4 id="changes-custom" className="text-sm font-semibold text-gray-900 dark:text-white">Customizations</h4>
                {editor.customizations.map((g) => {
                  const picked = draft.picks[g.id] ?? [];
                  return (
                    <fieldset key={g.id} className="space-y-1.5">
                      <legend className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                        {g.title} · {g.max_select > 1 ? `Pick up to ${g.max_select}` : "Pick one"}
                        {g.required ? " (required)" : " (optional)"}
                      </legend>
                      {g.options.map((o) => {
                        const on = picked.includes(o.id);
                        const full = g.max_select > 1 && !on && picked.length >= g.max_select;
                        return (
                          <label key={o.id} className={`flex items-center gap-3 p-2 rounded-lg border text-sm ${on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"} ${full ? "opacity-50" : "cursor-pointer"}`}>
                            <input
                              type={g.max_select > 1 ? "checkbox" : "radio"}
                              name={`pick-${g.id}`}
                              checked={on}
                              disabled={full}
                              onChange={() => set({ picks: togglePick(draft.picks, g, o.id) })}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="flex-1 text-gray-900 dark:text-white">{o.label}</span>
                            {o.price_text && <span className="text-gray-600 dark:text-gray-300 whitespace-nowrap">{o.price_text}</span>}
                          </label>
                        );
                      })}
                    </fieldset>
                  );
                })}
              </section>
            )}

            <label className="block text-sm text-gray-700 dark:text-gray-300">
              Note to {customerName} (optional)
              <textarea
                value={draft.note}
                maxLength={MAX_NOTE}
                onChange={(e) => set({ note: e.target.value })}
                rows={3}
                placeholder="Why the changes, in a sentence or two"
                className={`${inputCls} mt-1 resize-none`}
              />
            </label>

            {problem && <p className="text-sm text-amber-700 dark:text-amber-300">{problem}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-medium">
                Cancel
              </button>
              <button
                type="button"
                onClick={toReview}
                disabled={busy || !!problem}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Review new total
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
