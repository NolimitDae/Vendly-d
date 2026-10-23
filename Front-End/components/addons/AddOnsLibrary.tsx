"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Edit2, Lightbulb, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import {
  AddOnsService,
  type AddOn,
  type AddOnKind,
  type AddOnSuggestion,
} from "@/service/add-ons/add-ons.service";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import { apiError } from "@/service/contracts/contracts.service";
import AddOnFields, { draftFrom, draftToInput, emptyDraft, type AddOnDraft } from "./AddOnFields";

interface ListingOption {
  id: string;
  title: string;
  status?: string;
}

const COPY: Record<AddOnKind, { one: string; many: string; intro: string; empty: string }> = {
  ADD_ON: {
    one: "add-on",
    many: "Add-ons",
    intro: "Extras customers can pick when they book, like a bartender or a dessert table. Add them to your packages here or on the package form.",
    empty: "No add-ons yet.",
  },
  FEE: {
    one: "fee",
    many: "Fees",
    intro: "Fees like late return or cleaning. Customers see them on your packages. You send one after the service only if it applies, and the customer approves it before they're charged.",
    empty: "No fees yet.",
  },
};

/** The vendor's library of add-ons and fees, with bulk add to packages. */
export default function AddOnsLibrary() {
  const router = useRouter();
  const params = useSearchParams();
  const kind: AddOnKind = params.get("tab") === "fees" ? "FEE" : "ADD_ON";
  const copy = COPY[kind];

  const [items, setItems] = useState<AddOn[]>([]);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [ideas, setIdeas] = useState<AddOnSuggestion[] | null>(null);
  const [showIdeas, setShowIdeas] = useState(false);
  // null = closed, "new" = creating, otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddOnDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [packages, setPackages] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AddOnsService.list({ kind });
      setItems(res.data?.data ?? []);
    } catch (e) {
      toast.error(apiError(e, "Couldn't load your " + COPY[kind].many.toLowerCase()));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
    setSelected([]);
    setEditing(null);
    setShowIdeas(false);
    setIdeas(null);
  }, [load]);

  useEffect(() => {
    VendorListingService.getMyListings({ limit: 100 })
      .then((res) => setListings((res.data?.data ?? []).filter((l: ListingOption) => l.status !== "ARCHIVED")))
      .catch(() => setListings([]));
  }, []);

  const titleOf = useMemo(() => new Map(listings.map((l) => [l.id, l.title])), [listings]);

  const switchTab = (k: AddOnKind) => router.replace(k === "FEE" ? "/vendor/add-ons?tab=fees" : "/vendor/add-ons");

  const openIdeas = async () => {
    setShowIdeas((v) => !v);
    if (ideas) return;
    try {
      const res = await AddOnsService.suggestions(kind);
      setIdeas(res.data?.data ?? []);
    } catch {
      setIdeas([]);
    }
  };

  const startNew = (d?: Partial<AddOnDraft>) => {
    setDraft(emptyDraft(d));
    setEditing("new");
  };

  const save = async () => {
    const body = draftToInput(draft, kind);
    if (typeof body === "string") return toast.error(body);
    setSaving(true);
    try {
      if (editing === "new") {
        await AddOnsService.create(body);
        toast.success(`${kind === "FEE" ? "Fee" : "Add-on"} saved`);
      } else if (editing) {
        const { kind: _k, ...patch } = body;
        await AddOnsService.update(editing, patch);
        toast.success("Saved. Bookings already made keep the old price.");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: AddOn) => {
    if (!confirm(`Delete “${a.name}”? It comes off every package that offers it.`)) return;
    try {
      await AddOnsService.remove(a.id);
      toast.success("Deleted");
      setSelected((s) => s.filter((id) => id !== a.id));
      load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't delete"));
    }
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const attach = async (mode: "add" | "remove") => {
    if (!selected.length) return;
    if (!packages.length) return toast.error("Pick at least one package");
    setAttaching(true);
    try {
      const res = await AddOnsService.attach(selected, packages, mode);
      const d = res.data?.data ?? {};
      toast.success(mode === "add" ? `Added to ${packages.length} package${packages.length === 1 ? "" : "s"}${d.added === 0 ? " (already there)" : ""}` : "Removed from the packages you picked");
      setSelected([]);
      setPackages([]);
      load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't update your packages"));
    } finally {
      setAttaching(false);
    }
  };

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/vendor/listings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to listings
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add-ons and fees</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{copy.intro}</p>
        </div>

        <div role="tablist" aria-label="Add-ons or fees" className="flex gap-2">
          {(["ADD_ON", "FEE"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => switchTab(k)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${kind === k ? "bg-primary text-primary-foreground" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"}`}
            >
              {COPY[k].many}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startNew()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New {copy.one}
          </button>
          <button
            type="button"
            onClick={openIdeas}
            aria-expanded={showIdeas}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
          >
            <Lightbulb className="w-4 h-4 text-primary" /> Start from an idea
          </button>
        </div>

        {showIdeas && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            {!ideas ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : ideas.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No ideas right now.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ideas.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => { startNew({ name: s.name, price_unit: s.price_unit, description: s.description ?? "" }); setShowIdeas(false); }}
                    className="px-3 py-1.5 rounded-full text-sm bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Pick one to fill in the form. You set the price.</p>
          </div>
        )}

        {editing && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">{editing === "new" ? `New ${copy.one}` : `Edit ${copy.one}`}</h2>
            <AddOnFields draft={draft} onChange={setDraft} idPrefix="library" kind={kind} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">{copy.empty} Create one or start from an idea.</p>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            <label className="flex items-center gap-3 px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((i) => i.id))} className="w-4 h-4 accent-primary" />
              Select all
            </label>
            {items.map((a) => {
              const on = (a.listing_ids ?? []).map((id) => titleOf.get(id)).filter(Boolean) as string[];
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-4">
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.name}`}
                    checked={selected.includes(a.id)}
                    onChange={() => setSelected((s) => toggle(s, a.id))}
                    className="w-4 h-4 mt-1 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">{a.name}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{a.price_text}</p>
                    </div>
                    {a.description && <p className="text-sm text-gray-500 dark:text-gray-400">{a.description}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {on.length ? `On: ${on.join(", ")}` : (a.listing_ids?.length ?? 0) > 0 ? `On ${a.listing_ids!.length} package${a.listing_ids!.length === 1 ? "" : "s"}` : "Not on any package yet"}
                      {a.price_unit === "PER_ITEM" && a.max_quantity ? ` · up to ${a.max_quantity}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Edit ${a.name}`} onClick={() => { setDraft(draftFrom(a)); setEditing(a.id); }} className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label={`Delete ${a.name}`} onClick={() => remove(a)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected.length > 0 && (
          <section aria-label="Add to packages" className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-primary/30 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {selected.length} selected · choose packages
            </h2>
            {listings.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You have no packages yet. <Link href="/vendor/listings/new" className="text-primary hover:underline">Create one</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {listings.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                    <input type="checkbox" checked={packages.includes(l.id)} onChange={() => setPackages((p) => toggle(p, l.id))} className="w-4 h-4 accent-primary" />
                    <span className="truncate">{l.title}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={attaching || !packages.length} onClick={() => attach("add")} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
                {attaching && <Loader2 className="w-4 h-4 animate-spin" />} Add to packages
              </button>
              <button type="button" disabled={attaching || !packages.length} onClick={() => attach("remove")} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-60">
                Remove from packages
              </button>
              <button type="button" onClick={() => { setSelected([]); setPackages([]); }} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                Clear
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
