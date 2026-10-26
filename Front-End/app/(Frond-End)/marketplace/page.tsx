"use client";

import { isLoggedIn as hasSession } from "@/lib/session";
import { useEffect, useState, useCallback } from "react";
import { useDebounce } from "@/hooks";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import { SavedListingsService } from "@/service/savedListings/savedListings.service";
import Link from "next/link";
import Image from "next/image";
import { Star, Search, SlidersHorizontal, MapPin, Heart, LocateFixed, X, Loader2 } from "lucide-react";
import { useNearMe } from "@/hooks/useNearMe";

const RADII = [10, 25, 50, 100];
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import BrowseSwitch from "@/components/rentals/BrowseSwitch";
import TestBadge from "@/components/marketplace/TestBadge";

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  images: string[];
  location?: string;
  avg_rating?: number;
  category?: { id: string; name: string };
  vendor?: { id: string; name: string; avatar_url?: string; vendorProfile?: { business_name?: string } };
  _count?: { reviews: number };
  distance_miles?: number | null;
  /** a test vendor's package (Admin → Settings → Test vendors) */
  is_test?: boolean;
}

interface Category {
  id: string;
  name: string;
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });
  const [showFilters, setShowFilters] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const isLoggedIn = hasSession();
  const nearMe = useNearMe();
  const [radius, setRadius] = useState(25);
  // filters a link can set (e.g. "Find vendors" on an event plan): a day, a place and the planner's event
  const [linkRead, setLinkRead] = useState(false);
  const [date, setDate] = useState("");
  const [place, setPlace] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [eventId, setEventId] = useState("");
  const near = nearMe.active ? nearMe.coords : place;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cat = q.get("category_id");
    if (cat) setCategoryId(cat);
    const day = q.get("date");
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) setDate(day);
    const lat = Number(q.get("near_lat"));
    const lng = Number(q.get("near_lng"));
    if (q.get("near_lat") && q.get("near_lng") && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      setPlace({ lat, lng, label: q.get("near") || "the event" });
      const r = Number(q.get("radius_miles"));
      if (RADII.includes(r)) setRadius(r);
      setSort("distance");
    }
    const ev = q.get("event");
    if (ev) setEventId(ev);
    setLinkRead(true);
  }, []);

  const debouncedSearch = useDebounce(search, 400);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await MarketplaceService.searchListings({
        q: debouncedSearch || undefined,
        category_id: categoryId || undefined,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
        sort: !near && sort === "distance" ? "newest" : sort,
        page,
        limit: 12,
        ...(date ? { date } : {}),
        ...(near ? { near_lat: near.lat, near_lng: near.lng, radius_miles: radius } : {}),
      });
      if (res.data?.success) {
        setListings(res.data.data);
        setMeta(res.data.meta);
      }
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryId, minPrice, maxPrice, sort, page, near?.lat, near?.lng, radius, date]);

  const askForLocation = async () => {
    const ok = await nearMe.locate();
    if (ok) {
      setSort("distance");
      setPage(1);
    }
  };

  const toggleNearMe = () => {
    if (nearMe.active) {
      nearMe.turnOff();
      if (sort === "distance") setSort("newest");
      setPage(1);
    } else void askForLocation();
  };

  useEffect(() => { if (linkRead) fetchListings(); }, [fetchListings, linkRead]);

  useEffect(() => {
    MarketplaceService.getCategories().then((res) => {
      if (res.data?.success) setCategories(res.data.data);
    });
  }, []);

  // Load saved IDs once for logged-in users
  useEffect(() => {
    if (!isLoggedIn) return;
    SavedListingsService.getSavedIds()
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setSavedIds(new Set(res.data.data));
        }
      })
      .catch(() => {});
  }, [isLoggedIn]);

  const toggleSave = async (e: React.MouseEvent, listingId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { toast.info("Log in to save listings"); return; }
    const wasSaved = savedIds.has(listingId);
    // Optimistic update
    setSavedIds((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(listingId) : next.add(listingId);
      return next;
    });
    try {
      if (wasSaved) {
        await SavedListingsService.remove(listingId);
        toast.success("Removed from saved listings");
      } else {
        await SavedListingsService.save(listingId);
        toast.success("Saved to your favourites");
      }
    } catch {
      // Revert on error
      setSavedIds((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(listingId) : next.delete(listingId);
        return next;
      });
      toast.error("Failed to update saved listings");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <BrowseSwitch active="services" />
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Browse Services</h1>
          <p className="text-gray-500 mt-1 dark:text-gray-400">Find the perfect vendor for your needs</p>
        </div>

        {/* Search + filters bar */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
            {near && <option value="distance">Nearest</option>}
          </select>
          <button
            type="button"
            onClick={toggleNearMe}
            aria-pressed={nearMe.active}
            disabled={nearMe.status === "asking"}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition",
              nearMe.active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
            )}
          >
            {nearMe.status === "asking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            Near me
          </button>
          {near && (
            <select
              aria-label="Distance"
              value={radius}
              onChange={(e) => { setRadius(Number(e.target.value)); setPage(1); }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>Within {r} miles</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Price filter */}
        {showFilters && (
          <div className="flex gap-3 mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <label className="text-xs text-gray-500 block mb-1 dark:text-gray-400">Min Price ($)</label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
                placeholder="0"
                className="w-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1 dark:text-gray-400">Max Price ($)</label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
                placeholder="Any"
                className="w-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Filters from a link: shown so they can be taken off */}
        {(date || (place && !nearMe.active)) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {date && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100">
                Free on {new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                <button type="button" onClick={() => { setDate(""); setPage(1); }} aria-label="Remove date filter" className="p-0.5 text-gray-500 hover:text-gray-800 dark:hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {place && !nearMe.active && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                Near {place.label}
                <button
                  type="button"
                  onClick={() => { setPlace(null); if (sort === "distance") setSort("newest"); setPage(1); }}
                  aria-label="Remove location filter"
                  className="p-0.5 text-gray-500 hover:text-gray-800 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Ask for location: shown until the visitor turns it on or says not now */}
        {!near && !nearMe.active && nearMe.status !== "unsupported" && (nearMe.status === "denied" || !nearMe.dismissed) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 p-4 rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">Find vendors near you</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {nearMe.status === "denied"
                  ? "Location is blocked for this site. Allow it in your browser's site settings, then try again."
                  : nearMe.status === "error"
                    ? "We couldn't get your location. Check your connection and try again."
                    : "Share your location to see services closest to you first. We only use it for this search."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={askForLocation}
                disabled={nearMe.status === "asking"}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center gap-2"
              >
                {nearMe.status === "asking" && <Loader2 className="w-4 h-4 animate-spin" />}
                {nearMe.status === "denied" ? "Try again" : "Use my location"}
              </button>
              {nearMe.status !== "denied" && (
                <button
                  type="button"
                  onClick={nearMe.dismiss}
                  aria-label="Not now"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          {meta.total} services found{near ? ` within ${radius} miles${!nearMe.active && place ? ` of ${place.label}` : ""}` : ""}
        </p>

        {/* Listings grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200 dark:bg-gray-700" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg">No services found</p>
            <p className="text-sm">
              {near ? "Nothing that close yet. Try a bigger distance or turn off Near me." : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                eventId={eventId || undefined}
                isSaved={savedIds.has(listing.id)}
                onToggleSave={(e) => toggleSave(e, listing.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex justify-center gap-2 mt-10">
            {Array.from({ length: meta.last_page }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  page === i + 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
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

function ListingCard({
  listing,
  isSaved,
  onToggleSave,
  eventId,
}: {
  listing: Listing;
  isSaved: boolean;
  onToggleSave: (e: React.MouseEvent) => void;
  /** a planner finding vendors for one of their events: the listing page books for it */
  eventId?: string;
}) {
  const coverImage = listing.images?.[0];

  return (
    <Link href={`/marketplace/${listing.id}${eventId ? `?event=${encodeURIComponent(eventId)}` : ""}`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition group cursor-pointer border border-gray-100 dark:border-gray-700">
        <div className="relative h-48 bg-gray-100 dark:bg-gray-700 overflow-hidden">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={listing.title}
              fill
              className="object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-gray-600">
              <span className="text-4xl">🖼️</span>
            </div>
          )}
          {(listing.category || listing.is_test) && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              {listing.category && (
                <span className="bg-white/90 dark:bg-gray-900/90 text-xs font-medium px-2 py-1 rounded-full text-gray-600 dark:text-gray-300">
                  {listing.category.name}
                </span>
              )}
              {listing.is_test && <TestBadge />}
            </div>
          )}
          {/* Heart button */}
          <button
            onClick={onToggleSave}
            aria-label={isSaved ? "Remove from saved" : "Save listing"}
            className={cn(
              "absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition shadow",
              isSaved
                ? "bg-red-500 text-white"
                : "bg-white/90 dark:bg-gray-900/80 text-gray-400 hover:text-red-500",
            )}
          >
            <Heart className={cn("w-4 h-4", isSaved && "fill-current")} />
          </button>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-primary transition">
            {listing.title}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2 dark:text-gray-400">{listing.description}</p>

          {(listing.location || listing.distance_miles != null) && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              {listing.location}
              {listing.distance_miles != null && (
                <span className="text-primary font-medium">
                  {listing.location ? " · " : ""}
                  {listing.distance_miles < 1 ? "Under 1 mi" : `${listing.distance_miles} mi`} away
                </span>
              )}
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
              {listing.vendor.avatar_url ? (
                <Image
                  src={listing.vendor.avatar_url}
                  alt={listing.vendor.name}
                  width={24}
                  height={24}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">
                  {listing.vendor.name?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {listing.vendor.vendorProfile?.business_name || listing.vendor.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
