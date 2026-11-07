"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "react-toastify";
import { AddOnsService, type AddOn, type AddOnKind } from "@/service/add-ons/add-ons.service";
import { addOnPriceText } from "@/lib/addons";
import AddOnFields, { draftFrom, draftToInput, emptyDraft, type AddOnDraft } from "./AddOnFields";

/** Most add-ons and fees one package can offer. */
const MAX_PER_PACKAGE = 40;

export interface NewAddOn {
  key: string;
  kind: AddOnKind;
  draft: AddOnDraft;
}

export interface PackageAddOnsValue {
  /** ids of existing add-ons and fees on the package, in display order */
  chosen: string[];
  /** new ones to create once the package is saved */
  added: NewAddOn[];
  /** what the package had when the form opened (edit); null until it has loaded */
  initial: string[] | null;
}

export const emptyPackageAddOns = (): PackageAddOnsValue => ({ chosen: [], added: [], initial: null });

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * After the package is saved: creates the new add-ons and sets the package's full list.
 * `editing` packages only change when their list was loaded and something changed.
 */
export async function savePackageAddOns(listingId: string, v: PackageAddOnsValue, editing: boolean) {
  if (editing && v.initial === null) return;
  if (!v.added.length && sameList(v.chosen, v.initial ?? [])) return;
  const ids = [...v.chosen];
  for (const n of v.added) {
    const body = draftToInput(n.draft, n.kind);
    if (typeof body === "string") throw new Error(body);
    // saved to the vendor's library too, so it can be found, edited and reused there
    const res = await AddOnsService.create({ ...body, in_library: true, listing_ids: [listingId] });
    const id = res.data?.data?.id;
    if (id) ids.push(id);
  }
  await AddOnsService.setForListing(listingId, ids);
}

const GROUPS: { kind: AddOnKind; title: string; hint: string; one: string }[] = [
  { kind: "ADD_ON", title: "Add-ons", hint: "Extras the customer can pick when booking.", one: "add-on" },
  { kind: "FEE", title: "Fees", hint: "Shown on the package. You only send one after the service if it applies, and the customer approves it.", one: "fee" },
];

/** Package form section: pick add-ons and fees from the library or make new ones for this package. */
export default function PackageAddOns({
  listingId,
  value,
  onChange,
}: {
  listingId?: string;
  value: PackageAddOnsValue;
  onChange: (v: PackageAddOnsValue) => void;
}) {
  const [options, setOptions] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<AddOnKind | null>(null);
  const [draft, setDraft] = useState<AddOnDraft>(emptyDraft());
  const [failed, setFailed] = useState(false);
  // an add-on or fee being edited (it changes in the library, so on every package using it)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AddOnDraft>(emptyDraft());
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      AddOnsService.list(listingId ? { listing_id: listingId } : {}),
      listingId ? AddOnsService.forListing(listingId) : Promise.resolve(null),
    ])
      .then(([lib, current]) => {
        if (!live) return;
        const all: AddOn[] = lib.data?.data ?? [];
        setOptions(all);
        if (current) {
          const cur = current.data?.data ?? { add_ons: [], fees: [] };
          const ids = [...(cur.add_ons ?? []), ...(cur.fees ?? [])].map((a: AddOn) => a.id);
          // anything on the package but missing from the library list (custom ones) still shows
          const extra = [...(cur.add_ons ?? []), ...(cur.fees ?? [])].filter((a: AddOn) => !all.some((o) => o.id === a.id));
          if (extra.length) setOptions([...all, ...extra]);
          onChange({ ...value, chosen: ids, initial: ids });
        } else if (!listingId) {
          onChange({ ...value, initial: [] });
        }
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        if (!listingId) onChange({ ...value, initial: [] });
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // load once per package
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const total = value.chosen.length + value.added.length;

  const toggle = (id: string) => {
    if (value.chosen.includes(id)) return onChange({ ...value, chosen: value.chosen.filter((x) => x !== id) });
    if (total >= MAX_PER_PACKAGE) return toast.error(`A package can have up to ${MAX_PER_PACKAGE} add-ons and fees.`);
    onChange({ ...value, chosen: [...value.chosen, id] });
  };

  const startCreate = (kind: AddOnKind) => {
    setCreating(kind);
    setDraft(emptyDraft());
  };

  const startEdit = (o: AddOn) => {
    setEditingId(o.id);
    setEditDraft(draftFrom(o));
  };

  const saveEdit = async (o: AddOn) => {
    const body = draftToInput(editDraft, o.kind);
    if (typeof body === "string") return toast.error(body);
    setSavingEdit(true);
    try {
      const res = await AddOnsService.update(o.id, body);
      const updated: AddOn | undefined = res.data?.data;
      if (updated) setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...updated } : x)));
      setEditingId(null);
      toast.success("Saved. Every package using it shows the change.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn't save the change");
    } finally {
      setSavingEdit(false);
    }
  };

  const addNew = () => {
    if (!creating) return;
    const body = draftToInput(draft, creating);
    if (typeof body === "string") return toast.error(body);
    if (total >= MAX_PER_PACKAGE) return toast.error(`A package can have up to ${MAX_PER_PACKAGE} add-ons and fees.`);
    onChange({ ...value, added: [...value.added, { key: `${Date.now()}-${value.added.length}`, kind: creating, draft }] });
    setCreating(null);
  };

  const removeNew = (key: string) => onChange({ ...value, added: value.added.filter((n) => n.key !== key) });

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-5"
      // Enter in these fields shouldn't submit the package form around them
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Add-ons and fees</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Choose from your library, or make a new one: it&apos;s saved to your library too.</p>
        </div>
        <Link href="/vendor/add-ons" className="text-sm text-primary hover:underline">Manage library</Link>
      </div>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : failed && listingId ? (
        <p className="text-sm text-red-500">Couldn&apos;t load this package&apos;s add-ons. Refresh to try again.</p>
      ) : (
        GROUPS.map((g) => {
          const opts = options.filter((o) => o.kind === g.kind);
          const fresh = value.added.filter((n) => n.kind === g.kind);
          return (
            <fieldset key={g.kind} className="space-y-2">
              <legend className="text-sm font-medium text-gray-800 dark:text-gray-200">{g.title}</legend>
              <p className="text-xs text-gray-500 dark:text-gray-400">{g.hint}</p>
              {opts.length === 0 && fresh.length === 0 && (
                <p className="text-sm text-gray-400">None yet.</p>
              )}
              {opts.map((o) =>
                editingId === o.id ? (
                  <div key={o.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                    <AddOnFields draft={editDraft} onChange={setEditDraft} idPrefix={`edit-${o.id}`} kind={o.kind} />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Changes apply to every package using it. Bookings already made keep what they were booked with.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
                      <button type="button" onClick={() => saveEdit(o)} disabled={savingEdit} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                        {savingEdit ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={o.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <label className="flex flex-1 min-w-0 items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={value.chosen.includes(o.id)} onChange={() => toggle(o.id)} className="w-4 h-4 mt-0.5 accent-primary" />
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{o.name}</span>
                          <span className="text-gray-700 dark:text-gray-300">{o.price_text}</span>
                        </span>
                        {o.description && <span className="block text-xs text-gray-500 dark:text-gray-400">{o.description}</span>}
                      </span>
                    </label>
                    <button type="button" onClick={() => startEdit(o)} aria-label={`Edit ${o.name}`} className="p-1 text-gray-400 hover:text-primary">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                ),
              )}
              {fresh.map((n) => (
                <div key={n.key} className="flex items-start gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
                  <span className="flex-1 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{n.draft.name}</span>
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">new, saved to your library when you save the package</span>
                    <span className="block text-gray-700 dark:text-gray-300">{addOnPriceText(n.draft.price, n.draft.price_unit)}</span>
                  </span>
                  <button type="button" aria-label={`Remove ${n.draft.name}`} onClick={() => removeNew(n.key)} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {creating === g.kind ? (
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                  <AddOnFields draft={draft} onChange={setDraft} idPrefix={`pkg-${g.kind}`} kind={g.kind} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCreating(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
                    <button type="button" onClick={addNew} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Add {g.one}</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => startCreate(g.kind)} className="flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Plus className="w-4 h-4" /> New {g.one}
                </button>
              )}
            </fieldset>
          );
        })
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">Saved with the package. Up to {MAX_PER_PACKAGE} in total.</p>
    </div>
  );
}
