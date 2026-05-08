"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

export default function ServicesPageContent() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getCategories();
      if (res.data?.success) setCategories(res.data.data);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await AdminService.createCategory(newName.trim());
      if (res.data?.success) {
        toast.success("Category created");
        setNewName("");
        load();
      } else {
        toast.error(res.data?.message || "Failed to create");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create category");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? Listings in this category will lose their category.`)) return;
    setDeletingId(id);
    try {
      const res = await AdminService.deleteCategory(id);
      if (res.data?.success) {
        toast.success("Category deleted");
        setCategories((prev) => prev.filter((c) => c.id !== id));
      } else {
        toast.error(res.data?.message || "Failed to delete");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blackColor">Service Categories</h1>
          <p className="text-sm text-descriptionColor mt-0.5">
            {categories.length} categories
          </p>
        </div>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-3 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <p className="text-center py-16 text-sm text-gray-400">No categories yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm text-blackColor truncate">{cat.name}</p>
                <p className="text-xs text-descriptionColor mt-0.5">
                  {cat._count?.vendor_listings ?? 0} listings ·{" "}
                  {cat._count?.sub_categories ?? 0} sub-categories
                </p>
              </div>
              <button
                onClick={() => handleDelete(cat.id, cat.name)}
                disabled={deletingId === cat.id}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
              >
                {deletingId === cat.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                ) : (
                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 transition" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
