"use client";

import { useEffect, useState } from "react";
import { VendorListingService } from "@/service/vendor/vendor-listing.service";
import Image from "next/image";
import Link from "next/link";
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

interface Listing {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  status: string;
  images: string[];
  category?: { name: string };
  _count?: { bookings: number; reviews: number };
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  PAUSED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ARCHIVED: "bg-red-100 text-red-600",
};

export default function VendorListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });

  const fetchListings = async () => {
    setLoading(true);
    try {
      const res = await VendorListingService.getMyListings({ page });
      if (res.data?.success) {
        setListings(res.data.data);
        setMeta(res.data.meta);
      }
    } catch {
      toast.error("Failed to load listings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchListings(); }, [page]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await VendorListingService.remove(id);
      if (res.data?.success) {
        toast.success("Listing removed");
        fetchListings();
      } else {
        toast.error(res.data?.message || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete listing");
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublish = async (id: string) => {
    setPublishingId(id);
    try {
      const res = await VendorListingService.publish(id);
      if (res.data?.success) {
        toast.success("Listing is now live!");
        fetchListings();
      } else {
        toast.error(res.data?.message || "Failed to publish");
      }
    } catch {
      toast.error("Failed to publish listing");
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Listings</h1>
          <Link
            href="/vendor/listings/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            New Listing
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg">No listings yet</p>
            <Link href="/vendor/listings/new" className="mt-3 inline-block text-primary hover:underline text-sm">
              Create your first listing
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((listing) => (
              <div key={listing.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4">
                {/* Image */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                  {listing.images?.[0] ? (
                    <Image src={listing.images[0]} alt={listing.title} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">🖼️</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">{listing.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>${Number(listing.price).toFixed(2)} / {listing.price_unit}</span>
                        {listing.category && <span>• {listing.category.name}</span>}
                        {listing._count && (
                          <span>• {listing._count.bookings} bookings · {listing._count.reviews} reviews</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_STYLES[listing.status] ?? ""}`}>
                      {listing.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <Link
                      href={`/vendor/listings/${listing.id}/edit`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </Link>

                    {listing.status === "DRAFT" && (
                      <button
                        onClick={() => handlePublish(listing.id)}
                        disabled={publishingId === listing.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-green-200 text-green-600 hover:bg-green-50 transition disabled:opacity-60"
                      >
                        {publishingId === listing.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        Publish
                      </button>
                    )}

                    <Link
                      href={`/marketplace/${listing.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Preview
                    </Link>

                    <button
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60"
                    >
                      {deletingId === listing.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {meta.last_page > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: meta.last_page }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  page === i + 1 ? "bg-primary text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
