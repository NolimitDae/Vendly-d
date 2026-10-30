"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Tag } from "lucide-react";
import { toast } from "react-toastify";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { apiError } from "@/service/contracts/contracts.service";
import { VendorPromosService, type VendorPromo, type VendorPromoInput } from "@/service/promos/vendor-promos.service";

interface ListingOption {
  id: string;
  title: string;
  status?: string;
}

/** The form's text fields, sent as numbers (empty = none). */
interface Draft {
  code: string;
  description: string;
  kind: "percent" | "amount";
  value: string;
  min_amount: string;
  max_uses: string;
  expires_at: string;
  once_per_customer: boolean;
  first_booking_only: boolean;
  allPackages: boolean;
  listing_ids: string[];
}

const emptyDraft = (): Draft => ({ code: "", description: "", kind: "percent", value: "", min_amount: "", max_uses: "", expires_at: "", once_per_customer: true, first_booking_only: false, allPackages: true, listing_ids: [] });

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function draftFrom(p: VendorPromo): Draft {
  return {
    code: p.code,
    description: p.description ?? "",
    kind: p.percent_off != null ? "percent" : "amount",
    value: String(p.percent_off ?? p.amount_off ?? ""),
    min_amount: p.min_amount != null ? String(p.min_amount) : "",
    max_uses: p.max_uses != null ? String(p.max_uses) : "",
    expires_at: p.expires_at ? p.expires_at.slice(0, 10) : "",
    once_per_customer: p.once_per_customer,
    first_booking_only: p.first_booking_only,
    allPackages: !p.listing_ids.length,
    listing_ids: p.listing_ids,
  };
}

/** What's wrong with the form, or null. */
export function promoDraftError(d: Draft): string | null {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(d.code.trim())) return "Codes use 3–50 letters, numbers, dashes or underscores.";
  const v = Number(d.value);
  if (!d.value.trim() || !(v > 0)) return d.kind === "percent" ? "Enter the percent off." : "Enter the amount off.";
  if (d.kind === "percent" && v > 90) return "A code can take at most 90% off.";
  if (d.min_amount.trim() && !(Number(d.min_amount) > 0)) return "The minimum booking must be more than $0.";
  if (d.max_uses.trim() && !(Number.isInteger(Number(d.max_uses)) && Number(d.max_uses) > 0)) return "The number of uses must be a whole number.";
  if (!d.allPackages && !d.listing_ids.length) return "Pick at least one package, or let it work on all of them.";
  return null;
}

function draftToInput(d: Draft): VendorPromoInput {
  const v = Number(d.value);
  return {
    code: d.code.trim().toUpperCase(),
    description: d.description.trim() || undefined,
    percent_off: d.kind === "percent" ? v : null,
    amount_off: d.kind === "amount" ? v : null,
    min_amount: num(d.min_amount),
    max_uses: num(d.max_uses),
    // the end of the chosen day, in the vendor's time zone
    expires_at: d.expires_at ? new Date(`${d.expires_at}T23:59:59`).toISOString() : null,
    once_per_customer: d.once_per_customer,
    first_booking_only: d.first_booking_only,
    listing_ids: d.allPackages ? [] : d.listing_ids,
  };
}

const money = (n: number | string) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** "15% off" or "$20 off", with its limits. */
function promoSummary(p: VendorPromo, titles: Map<string, string>) {
  const off = p.percent_off != null ? `${Number(p.percent_off)}% off` : `${money(p.amount_off ?? 0)} off`;
  const parts = [off];
  if (p.min_amount != null) parts.push(`bookings of ${money(p.min_amount)}+`);
  if (p.once_per_customer) parts.push("once per customer");
  if (p.first_booking_only) parts.push("first booking only");
  parts.push(p.listing_ids.length ? p.listing_ids.map((id) => titles.get(id) ?? "a package").join(", ") : "all your packages");
  return parts.join(" · ");
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

/** The vendor's promo codes: customers type one when booking to get money off this vendor's packages. */
export default function VendorPromoCodes() {
  const [promos, setPromos] = useState<VendorPromo[] | null>(null);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await VendorPromosService.list();
      setPromos(res.data?.data ?? []);
    } catch (e) {
      toast.error(apiError(e, "Couldn't load your promo codes"));
      setPromos([]);
    }
  }, []);

  useEffect(() => {
    load();
    VendorListingService.getMyListings({ limit: 100 })
      .then((res) => setListings((res.data?.data ?? []).filter((l: ListingOption) => l.status !== "ARCHIVED")))
      .catch(() => setListings([]));
  }, [load]);

  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const save = async () => {
    if (!editing) return;
    const problem = promoDraftError(editing.draft);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      const input = draftToInput(editing.draft);
      if (editing.id) await VendorPromosService.update(editing.id, input);
      else await VendorPromosService.create(input);
      toast.success(editing.id ? "Promo code saved" : "Promo code created");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't save the promo code"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: VendorPromo) => {
    try {
      await VendorPromosService.update(p.id, { active: !p.active });
      await load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't change the promo code"));
    }
  };

  const d = editing?.draft;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Promo codes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Customers type a code when they book to get money off your packages. The discount comes off your price; the Vendly Protection fee is worked out on what they pay.
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing({ id: null, draft: emptyDraft() })} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> New code
          </button>
        )}
      </div>

      {editing && d && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4" aria-label={editing.id ? "Edit promo code" : "New promo code"}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="promo-code" className={labelCls}>Code</label>
              <input id="promo-code" value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="SUMMER15" maxLength={50} className={inputCls} />
            </div>
            <div>
              <label htmlFor="promo-description" className={labelCls}>Note (optional)</label>
              <input id="promo-description" value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Summer weddings" maxLength={255} className={inputCls} />
            </div>
            <div>
              <span className={labelCls}>Discount</span>
              <div className="flex gap-2">
                <select aria-label="Discount type" value={d.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })} className={`${inputCls} w-40`}>
                  <option value="percent">Percent off</option>
                  <option value="amount">Amount off ($)</option>
                </select>
                <input aria-label={d.kind === "percent" ? "Percent off" : "Amount off"} type="number" min="0" step={d.kind === "percent" ? "1" : "0.01"} max={d.kind === "percent" ? 90 : undefined} value={d.value} onChange={(e) => set({ value: e.target.value })} placeholder={d.kind === "percent" ? "15" : "25.00"} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="promo-min" className={labelCls}>Minimum booking, $ (optional)</label>
              <input id="promo-min" type="number" min="0" step="0.01" value={d.min_amount} onChange={(e) => set({ min_amount: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="promo-uses" className={labelCls}>How many times it can be used (optional)</label>
              <input id="promo-uses" type="number" min="1" step="1" value={d.max_uses} onChange={(e) => set({ max_uses: e.target.value })} placeholder="No limit" className={inputCls} />
            </div>
            <div>
              <label htmlFor="promo-expires" className={labelCls}>Last day it works (optional)</label>
              <input id="promo-expires" type="date" value={d.expires_at} onChange={(e) => set({ expires_at: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={d.once_per_customer} onChange={(e) => set({ once_per_customer: e.target.checked })} /> Each customer can use it once</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={d.first_booking_only} onChange={(e) => set({ first_booking_only: e.target.checked })} /> Only on a customer&apos;s first booking on Vendly</label>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelCls}>Works on</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="radio" name="promo-scope" checked={d.allPackages} onChange={() => set({ allPackages: true })} /> All my packages</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="radio" name="promo-scope" checked={!d.allPackages} onChange={() => set({ allPackages: false })} /> Only some packages</label>
            {!d.allPackages && (
              <div className="ml-6 space-y-1 max-h-48 overflow-y-auto">
                {listings.length === 0 && <p className="text-sm text-gray-500">You have no packages yet.</p>}
                {listings.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={d.listing_ids.includes(l.id)}
                      onChange={(e) => set({ listing_ids: e.target.checked ? [...d.listing_ids, l.id] : d.listing_ids.filter((x) => x !== l.id) })}
                    />
                    {l.title}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex gap-3">
            <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60">
              {saving ? "Saving…" : editing.id ? "Save" : "Create code"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </section>
      )}

      {promos === null ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : promos.length === 0 ? (
        !editing && (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <Tag className="w-8 h-8 mx-auto mb-2 text-primary" />
            No promo codes yet. Make one to reward repeat customers or fill quiet dates.
          </div>
        )
      ) : (
        <ul className="space-y-3">
          {promos.map((p) => (
            <li key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono font-semibold text-gray-900 dark:text-white">
                  {p.code}
                  {!p.active && <span className="ml-2 text-xs font-sans font-medium text-gray-500">Off</span>}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">{promoSummary(p, titles)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Used {p.uses}
                  {p.max_uses != null ? ` of ${p.max_uses}` : ""} {p.uses === 1 ? "time" : "times"}
                  {p.expires_at ? ` · works until ${new Date(p.expires_at).toLocaleDateString()}` : ""}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-3 text-sm font-semibold">
                <button type="button" onClick={() => setEditing({ id: p.id, draft: draftFrom(p) })} className="text-primary">Edit</button>
                <button type="button" onClick={() => toggle(p)} className="text-gray-600 dark:text-gray-300">{p.active ? "Turn off" : "Turn on"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
