"use client";

import { useEffect, useState } from "react";
import { Heart, MapPin, Package, Star, Store } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import TestBadge from "@/components/marketplace/TestBadge";
import { SavedVendorsService, type SavedVendor } from "@/service/savedVendors/savedVendors.service";

/** A vendor's shop address: their handle when they have one. */
const shopHref = (v: SavedVendor["vendor"]) => (v.handle ? `/v/${encodeURIComponent(v.handle)}` : `/marketplace/vendors/${v.id}`);

/** Favorites → Vendors: the vendors the customer saved from their shop pages. */
export default function SavedVendors() {
  const [items, setItems] = useState<SavedVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    SavedVendorsService.getAll()
      .then((res) => {
        if (res.data?.success) setItems(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (vendorId: string) => {
    setRemoving(vendorId);
    const removed = items.find((item) => item.vendor.id === vendorId);
    setItems((prev) => prev.filter((item) => item.vendor.id !== vendorId));
    try {
      await SavedVendorsService.remove(vendorId);
      toast.success("Removed from favorites");
    } catch {
      // put it back where it was (newest saved first)
      if (removed) setItems((prev) => [...prev, removed].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast.error("Could not remove the vendor");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {loading ? "Loading…" : `${items.length} vendor${items.length !== 1 ? "s" : ""} saved`}
      </p>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 animate-pulse flex gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
            <Store className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No saved vendors yet</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mb-6">
            Open a vendor&apos;s shop and tap the{" "}
            <Heart className="inline w-4 h-4 text-red-400 fill-current" /> heart to save them here.
          </p>
          <Link
            href="/marketplace"
            className="gradient-bg text-white font-semibold px-7 py-2.5 rounded-full text-sm hover:opacity-90 transition"
          >
            Browse marketplace
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(({ id, vendor }) => {
            const name = vendor.business_name || vendor.name;
            const mark = vendor.logo_url || vendor.avatar_url;
            return (
              <div
                key={id}
                className="relative bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col"
              >
                <button
                  onClick={() => handleRemove(vendor.id)}
                  disabled={removing === vendor.id}
                  aria-label={`Remove ${name} from favorites`}
                  className={cn(
                    "absolute top-4 right-4 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow transition",
                    removing === vendor.id ? "opacity-50" : "hover:bg-red-600 active:scale-95",
                  )}
                >
                  <Heart className="w-4 h-4 fill-current" />
                </button>

                <div className="flex items-start gap-4 pr-10">
                  {mark ? (
                    <Image src={mark} alt={`${name} logo`} width={64} height={64} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" unoptimized />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl flex-shrink-0">
                      {name?.[0]?.toUpperCase() ?? "V"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white break-words">
                      {name}
                      {vendor.is_test && <TestBadge className="ml-2 align-middle" />}
                    </h3>
                    {vendor.categories.length > 0 && (
                      <p className="text-xs text-primary font-medium mt-0.5 truncate">{vendor.categories.join(", ")}</p>
                    )}
                    {vendor.location && (
                      <p className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{vendor.location}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm">
                  <span className="flex items-center gap-1 text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span className="font-medium">{vendor.avg_rating != null ? Number(vendor.avg_rating).toFixed(1) : "New"}</span>
                    <span className="text-gray-400 text-xs">
                      ({vendor.review_count} review{vendor.review_count !== 1 ? "s" : ""})
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                    <Package className="w-3.5 h-3.5" />
                    {vendor.listing_count} service{vendor.listing_count !== 1 ? "s" : ""}
                  </span>
                </div>

                <Link
                  href={shopHref(vendor)}
                  className="mt-4 text-center py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
                >
                  View shop
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
