"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminService } from "@/service/admin/admin.service";
import { Loader2, Trash2, Eye, ToggleLeft, ToggleRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "react-toastify";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-500",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-yellow-100 text-yellow-700",
  ARCHIVED: "bg-red-100 text-red-600",
};

export default function AdminListingsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminService.getListings({
        page,
        limit: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      if (res.data?.success) {
        setListings(res.data.data);
        setMeta(res.data.meta);
      }
    } catch {
      toast.error("Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const next = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await AdminService.updateListingStatus(id, next);
      if (res.data?.success) {
        setListings((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status: next } : l)),
        );
        toast.success(`Listing ${next.toLowerCase()}`);
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this listing? This cannot be undone.")) return;
    try {
      const res = await AdminService.removeListing(id);
      if (res.data?.success) {
        setListings((prev) => prev.filter((l) => l.id !== id));
        toast.success("Listing removed");
      }
    } catch {
      toast.error("Failed to remove listing");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-blackColor">All Listings</h1>
        <span className="text-sm text-descriptionColor">{meta.total} total</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white flex-1 min-w-[200px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="PAUSED">Paused</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : listings.length === 0 ? (
        <p className="text-center py-20 text-gray-400 text-sm">No listings found</p>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-4"
            >
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {listing.images?.[0] ? (
                  <Image src={listing.images[0]} alt="" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-2xl">🖼️</div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-blackColor line-clamp-1">{listing.title}</p>
                    <p className="text-xs text-descriptionColor mt-0.5">
                      by {listing.vendor?.name || listing.vendor?.email} · {listing.category?.name || "—"}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[listing.status] ?? ""}`}>
                    {listing.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2 text-xs text-descriptionColor">
                  <span>${Number(listing.price).toFixed(2)}</span>
                  <span>{listing._count?.bookings ?? 0} bookings</span>
                  <span>{listing._count?.reviews ?? 0} reviews</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href={`/marketplace/${listing.id}`} target="_blank">
                  <Eye className="w-4 h-4 text-gray-400 hover:text-primary transition" />
                </Link>
                <button onClick={() => handleStatusToggle(listing.id, listing.status)}>
                  {listing.status === "ACTIVE" ? (
                    <ToggleRight className="w-5 h-5 text-green-500 hover:text-yellow-500 transition" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-400 hover:text-green-500 transition" />
                  )}
                </button>
                <button onClick={() => handleRemove(listing.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 transition" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: meta.last_page }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                page === i + 1
                  ? "bg-primary text-white"
                  : "bg-white border border-gray-200 text-gray-600"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
