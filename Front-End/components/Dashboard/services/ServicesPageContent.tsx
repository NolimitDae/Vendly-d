"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminService } from "@/service/admin/admin.service";
import { Check, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "react-toastify";

interface Sub {
  id: string;
  name: string;
  _count?: { vendor_listings: number };
}
interface Category {
  id: string;
  name: string;
  _count?: { vendor_listings: number; sub_categories: number };
  sub_categories?: Sub[];
}

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

const inputCls =
  "px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 dark:border-gray-700";

/** A name that becomes an input while editing; Enter saves, Escape cancels. */
function EditableName({ name, label, onSave }: { name: string; label: string; onSave: (next: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = value.trim();
    if (next === name) return setEditing(false);
    if (next.length < 2) return toast.error("Names need at least 2 characters");
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1.5 text-left"
        aria-label={`Rename ${label}`}
      >
        <span>{name}</span>
        <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition" aria-hidden />
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        maxLength={100}
        aria-label={`New name for ${label}`}
        className={`${inputCls} py-1`}
      />
      <button type="button" onClick={save} disabled={saving} aria-label="Save name" className="p-1 text-green-600">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel rename" className="p-1 text-gray-400">
        <X className="w-4 h-4" />
      </button>
    </span>
  );
}

/** Service categories and their sub-categories: what vendors pick for packages and customers search by. */
export default function ServicesPageContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newSub, setNewSub] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await AdminService.getCategories();
      if (res.data?.success) setCategories(res.data.data);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q) || c.sub_categories?.some((s) => s.name.toLowerCase().includes(q)));
  }, [categories, query]);

  const run = async (id: string, action: () => Promise<any>, success: string, fallback: string) => {
    setBusyId(id);
    try {
      const res = await action();
      if (res.data?.success === false) throw { response: { data: res.data } };
      toast.success(success);
      await load();
      return true;
    } catch (err) {
      toast.error(apiMessage(err, fallback));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) return;
    setCreating(true);
    const ok = await run("new", () => AdminService.createCategory(newName.trim()), "Category created", "Failed to create category");
    if (ok) setNewName("");
    setCreating(false);
  };

  const removeCategory = (c: Category) => {
    const listings = c._count?.vendor_listings ?? 0;
    const subs = c._count?.sub_categories ?? 0;
    const effects = [subs && `its ${subs} sub-categor${subs === 1 ? "y" : "ies"}`, listings && `the category on ${listings} package${listings === 1 ? "" : "s"}`].filter(Boolean);
    if (!confirm(`Delete "${c.name}"?${effects.length ? ` This also removes ${effects.join(" and ")}.` : ""}`)) return;
    void run(c.id, () => AdminService.deleteCategory(c.id), "Category deleted", "Failed to delete category");
  };

  const removeSub = (s: Sub) => {
    const listings = s._count?.vendor_listings ?? 0;
    if (!confirm(`Delete "${s.name}"?${listings ? ` ${listings} package${listings === 1 ? "" : "s"} keep their category but lose this sub-category.` : ""}`)) return;
    void run(s.id, () => AdminService.deleteSubcategory(s.id), "Sub-category deleted", "Failed to delete sub-category");
  };

  const addSub = async (e: React.FormEvent, categoryId: string) => {
    e.preventDefault();
    if (newSub.trim().length < 2) return toast.error("Names need at least 2 characters");
    const ok = await run(`sub:${categoryId}`, () => AdminService.createSubcategory(categoryId, newSub.trim()), "Sub-category added", "Failed to add sub-category");
    if (ok) setNewSub("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-blackColor">Service Categories</h1>
          <p className="text-sm text-descriptionColor mt-0.5">
            {categories.length} categories · {categories.reduce((n, c) => n + (c._count?.sub_categories ?? 0), 0)} sub-categories. Vendors pick these for their
            packages; customers search by them.
          </p>
        </div>
        <label className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a category" aria-label="Find a category" className={`${inputCls} pl-9`} />
        </label>
      </div>

      <form onSubmit={handleCreate} className="flex gap-3 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name…"
          aria-label="New category name"
          maxLength={100}
          className={`${inputCls} flex-1 py-2.5`}
        />
        <button
          type="submit"
          disabled={creating || newName.trim().length < 2}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add category
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center py-16 text-sm text-gray-400">{categories.length ? "No category matches." : "No categories yet"}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((cat) => {
            const expanded = open === cat.id;
            return (
              <li key={cat.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-800">
                <div className="flex items-center gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(expanded ? null : cat.id);
                      setNewSub("");
                    }}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} sub-categories of ${cat.name}`}
                    className="p-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-blackColor">
                      <EditableName
                        name={cat.name}
                        label={cat.name}
                        onSave={(name) => run(cat.id, () => AdminService.renameCategory(cat.id, name), "Category renamed", "Failed to rename category")}
                      />
                    </p>
                    <p className="text-xs text-descriptionColor mt-0.5">
                      {cat._count?.vendor_listings ?? 0} packages · {cat._count?.sub_categories ?? 0} sub-categories
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCategory(cat)}
                    disabled={busyId === cat.id}
                    aria-label={`Delete ${cat.name}`}
                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                  >
                    {busyId === cat.id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 transition" />}
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-2">
                    {cat.sub_categories?.length ? (
                      <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {cat.sub_categories.map((s) => (
                          <li key={s.id} className="flex items-center gap-3 py-2 pl-8">
                            <span className="flex-1 text-sm text-blackColor">
                              <EditableName
                                name={s.name}
                                label={s.name}
                                onSave={(name) => run(s.id, () => AdminService.renameSubcategory(s.id, name), "Sub-category renamed", "Failed to rename sub-category")}
                              />
                            </span>
                            <span className="text-xs text-descriptionColor">{s._count?.vendor_listings ?? 0} packages</span>
                            <button
                              type="button"
                              onClick={() => removeSub(s)}
                              disabled={busyId === s.id}
                              aria-label={`Delete ${s.name}`}
                              className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                            >
                              {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-descriptionColor pl-8">No sub-categories yet.</p>
                    )}
                    <form onSubmit={(e) => addSub(e, cat.id)} className="flex gap-2 pl-8 pt-1">
                      <input
                        value={newSub}
                        onChange={(e) => setNewSub(e.target.value)}
                        placeholder={`Add a sub-category to ${cat.name}`}
                        aria-label={`New sub-category in ${cat.name}`}
                        maxLength={100}
                        className={`${inputCls} flex-1`}
                      />
                      <button
                        type="submit"
                        disabled={busyId === `sub:${cat.id}` || newSub.trim().length < 2}
                        className="px-3 py-2 rounded-xl border border-primary text-primary text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {busyId === `sub:${cat.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
