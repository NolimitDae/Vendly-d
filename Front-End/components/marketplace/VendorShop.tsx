"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Star, Package, Loader2, Store } from "lucide-react";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import ReviewList from "@/components/marketplace/ReviewList";
import { AddToTeamButton } from "@/components/events/VendorTeams";
import TestBadge from "@/components/marketplace/TestBadge";
import ShareButton from "@/components/marketplace/ShareButton";
import SaveVendorButton from "@/components/marketplace/SaveVendorButton";
import SocialLinks, { type SocialLinksData } from "@/components/marketplace/SocialLinks";

export interface VendorShopData {
  id: string;
  name: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  handle?: string | null;
  avg_rating?: number | null;
  vendorProfile?: { business_name?: string | null; about_me?: string | null } | null;
  /** a test vendor (Admin → Settings → Test vendors) */
  is_test?: boolean;
  /** social accounts as full links */
  socials?: SocialLinksData | null;
  vendorListings?: {
    id: string;
    title: string;
    price: number | string;
    price_unit?: string;
    images?: string[];
    category?: { name: string } | null;
  }[];
  _count?: { vendorListings?: number; receivedReviews?: number };
}

/** The public address of a vendor's shop: vendlymarketplace.com/v/<handle>. */
export const shopUrl = (handle: string) =>
  `${typeof window !== "undefined" ? window.location.origin : "https://vendlymarketplace.com"}/v/${handle}`;

/** A vendor's public shop page, looked up by user id or by shop handle. */
export default function VendorShop({ idOrHandle }: { idOrHandle: string }) {
  const [vendor, setVendor] = useState<VendorShopData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let live = true;
    setState("loading");
    MarketplaceService.getVendorProfile(idOrHandle)
      .then((res) => {
        if (!live) return;
        if (res.data?.success && res.data.data) {
          setVendor(res.data.data);
          setState("ready");
        } else setState("missing");
      })
      .catch(() => live && setState("missing"));
    return () => {
      live = false;
    };
  }, [idOrHandle]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (state === "missing" || !vendor) {
    return (
      <div className="min-h-[60vh] bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <Store className="w-10 h-10 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">We couldn&apos;t find that shop</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">The link may be mistyped, or the vendor changed it.</p>
        <Link href="/marketplace" className="text-primary text-sm font-medium hover:underline">
          Browse the marketplace
        </Link>
      </div>
    );
  }

  const profile = vendor.vendorProfile;
  const displayName = profile?.business_name || vendor.name;
  const initials = displayName?.[0]?.toUpperCase() ?? "V";
  const listings = vendor.vendorListings ?? [];
  const reviews = vendor._count?.receivedReviews ?? 0;
  const activeServices = vendor._count?.vendorListings ?? listings.length;
  const mark = vendor.logo_url || vendor.avatar_url;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/marketplace"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm dark:text-gray-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm mb-6 overflow-hidden">
          {/* Cover: the vendor's banner, else the brand gradient */}
          <div className="relative h-40 sm:h-56 bg-gradient-to-r from-[#4A1650] via-[#7A2A82] to-[#A84AB0]">
            {vendor.banner_url && (
              <Image src={vendor.banner_url} alt={`${displayName} banner`} fill className="object-cover" unoptimized priority />
            )}
          </div>

          <div className="px-6 sm:px-8 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
              {mark ? (
                <Image
                  src={mark}
                  alt={`${displayName} logo`}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-white dark:border-gray-800 bg-white flex-shrink-0"
                  unoptimized
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-primary border-4 border-white dark:border-gray-800 flex items-center justify-center text-primary-foreground font-bold text-3xl flex-shrink-0">
                  {initials}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white break-words">
                  {displayName}
                  {vendor.is_test && <TestBadge className="ml-2 align-middle" />}
                </h1>
                {profile?.business_name && vendor.name !== profile.business_name && (
                  <p className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">{vendor.name}</p>
                )}
              </div>

              <AddToTeamButton vendor={{ id: vendor.id, name: displayName, avatar_url: mark ?? null, category: listings[0]?.category?.name ?? null }} />

              {/* customers save the vendor to Favorites (by id: the address may hold the shop handle) */}
              <SaveVendorButton vendorId={vendor.id} className="self-start sm:self-auto" />

              {/* the shop link (vendlymarketplace.com/v/<handle>, or the vendor's id without one) */}
              <ShareButton
                path={`/v/${encodeURIComponent(vendor.handle || vendor.id)}`}
                title={displayName}
                text={`Check out ${displayName} on Vendly`}
                label="Share shop"
                className="self-start sm:self-auto"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm">
              <span className="flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {vendor.avg_rating != null ? Number(vendor.avg_rating).toFixed(1) : "New"}
                </span>
                <span className="text-gray-400">
                  ({reviews} review{reviews !== 1 ? "s" : ""})
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Package className="w-4 h-4" />
                {activeServices} active service{activeServices !== 1 ? "s" : ""}
              </span>
            </div>

            <SocialLinks socials={vendor.socials} className="mt-4" />

            {profile?.about_me && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-2">About</h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{profile.about_me}</p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Services</h2>
          {!listings.length ? (
            <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No active services yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/marketplace/${listing.id}`}
                  className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 dark:border-gray-700 group"
                >
                  <div className="relative h-40 bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    {listing.images?.[0] ? (
                      <Image
                        src={listing.images[0]}
                        alt={listing.title}
                        fill
                        className="object-cover group-hover:scale-105 transition duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Package className="w-10 h-10 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-1.5">
                      {listing.category && <span className="text-xs text-primary font-medium">{listing.category.name}</span>}
                      {vendor.is_test && <TestBadge />}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mt-1 line-clamp-2">{listing.title}</h3>
                    <p className="mt-2 font-bold text-gray-900 dark:text-white">
                      ${Number(listing.price).toFixed(2)}
                      {listing.price_unit && <span className="text-xs font-normal text-gray-400 ml-1">/{listing.price_unit}</span>}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <ReviewList vendorId={vendor.id} />
        </div>
      </div>
    </div>
  );
}
