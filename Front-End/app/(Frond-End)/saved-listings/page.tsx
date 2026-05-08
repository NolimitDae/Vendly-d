"use client";

import { useEffect, useState } from "react";
import { Bookmark, Heart, MapPin, Star, Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import Container from "@/app/_components/Container";
import { SavedListingsService } from "@/service/savedListings/savedListings.service";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

interface SavedItem {
  id: string;
  created_at: string;
  listing: {
    id: string;
    title: string;
    description: string;
    price: number;
    price_unit: string;
    images: string[];
    location?: string;
    avg_rating?: number;
    category?: { id: string; name: string };
    vendor?: {
      id: string;
      name: string;
      avatar?: string;
      vendorProfile?: { business_name?: string };
    };
    _count?: { reviews: number; bookings: number };
  };
}

export default function SavedListingsPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    SavedListingsService.getAll()
      .then((res) => {
        if (res.data?.success) setItems(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (listingId: string) => {
    setRemoving(listingId);
    // Optimistic remove
    setItems((prev) => prev.filter((item) => item.listing.id !== listingId));
    try {
      await SavedListingsService.remove(listingId);
      toast.success("Removed from saved listings");
    } catch {
      // Reload on error
      SavedListingsService.getAll()
        .then((res) => { if (res.data?.success) setItems(res.data.data ?? []); })
        .catch(() => {});
      toast.error("Failed to remove listing");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="py-12 sm:py-20 min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container>
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Saved Listings
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {loading ? "Loading…" : `${items.length} service${items.length !== 1 ? "s" : ""} bookmarked`}
            </p>
          </div>
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 text-sm text-primary font-medium hover:opacity-80 transition"
          >
            Browse marketplace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-44 bg-gray-200 dark:bg-gray-700" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
              <Bookmark className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No saved listings yet
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mb-6">
              Browse the marketplace and tap the{" "}
              <Heart className="inline w-4 h-4 text-red-400 fill-current" /> heart icon on any
              service to save it here.
            </p>
            <Link
              href="/marketplace"
              className="gradient-bg text-white font-semibold px-7 py-2.5 rounded-full text-sm hover:opacity-90 transition"
            >
              Browse Marketplace
            </Link>
          </div>
        )}

        {/* Grid */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => {
              const { listing } = item;
              const cover = listing.images?.[0];
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 group flex flex-col"
                >
                  {/* Image */}
                  <div className="relative h-44 bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={listing.title}
                        fill
                        className="object-cover group-hover:scale-105 transition duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-4xl text-gray-300">
                        🖼️
                      </div>
                    )}
                    {listing.category && (
                      <span className="absolute top-3 left-3 bg-white/90 dark:bg-gray-900/90 text-xs font-medium px-2 py-1 rounded-full text-gray-600 dark:text-gray-300">
                        {listing.category.name}
                      </span>
                    )}
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(listing.id)}
                      disabled={removing === listing.id}
                      aria-label="Remove from saved"
                      className={cn(
                        "absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow transition",
                        removing === listing.id ? "opacity-50" : "hover:bg-red-600 active:scale-95",
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-primary transition">
                      {listing.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{listing.description}</p>

                    {listing.location && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />
                        {listing.location}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <span className="text-primary font-bold text-lg">
                        ${Number(listing.price).toFixed(2)}
                        <span className="text-xs text-gray-400 font-normal ml-1">/ {listing.price_unit}</span>
                      </span>
                      {listing.avg_rating && (
                        <div className="flex items-center gap-1 text-sm text-amber-500">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span className="font-medium">{listing.avg_rating.toFixed(1)}</span>
                          <span className="text-gray-400 text-xs">({listing._count?.reviews})</span>
                        </div>
                      )}
                    </div>

                    {listing.vendor && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        {listing.vendor.avatar ? (
                          <Image
                            src={listing.vendor.avatar}
                            alt={listing.vendor.name}
                            width={20}
                            height={20}
                            className="rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-medium flex-shrink-0">
                            {listing.vendor.name?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {listing.vendor.vendorProfile?.business_name || listing.vendor.name}
                        </span>
                      </div>
                    )}

                    {/* View + Book CTAs */}
                    <div className="flex gap-2 mt-4">
                      <Link
                        href={`/marketplace/${listing.id}`}
                        className="flex-1 text-center py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                      >
                        View
                      </Link>
                      <Link
                        href={`/marketplace/${listing.id}`}
                        className="flex-1 text-center py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition"
                      >
                        Book Now
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
