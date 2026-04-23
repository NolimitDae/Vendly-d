"use client";

import { useEffect, useState, useCallback } from "react";
import { useDebounce } from "@/hooks";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import Link from "next/link";
import Image from "next/image";
import { Star, Search, SlidersHorizontal, MapPin } from "lucide-react";

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

  const debouncedSearch = useDebounce(search, 400);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await MarketplaceService.searchListings({
        q: debouncedSearch || undefined,
        category_id: categoryId || undefined,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
        sort,
        page,
        limit: 12,
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
  }, [debouncedSearch, categoryId, minPrice, maxPrice, sort, page]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    MarketplaceService.getCategories().then((res) => {
      if (res.data?.success) setCategories(res.data.data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Browse Services</h1>
          <p className="text-gray-500 mt-1">Find the perfect vendor for your needs</p>
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
          </select>
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
              <label className="text-xs text-gray-500 block mb-1">Min Price ($)</label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
                placeholder="0"
                className="w-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Max Price ($)</label>
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

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">{meta.total} services found</p>

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
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
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
                    ? "bg-primary text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100"
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

function ListingCard({ listing }: { listing: Listing }) {
  const coverImage = listing.images?.[0];

  return (
    <Link href={`/marketplace/${listing.id}`}>
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
          {listing.category && (
            <span className="absolute top-3 left-3 bg-white/90 dark:bg-gray-900/90 text-xs font-medium px-2 py-1 rounded-full text-gray-600 dark:text-gray-300">
              {listing.category.name}
            </span>
          )}
        </div>
        <div className="p-4">
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
