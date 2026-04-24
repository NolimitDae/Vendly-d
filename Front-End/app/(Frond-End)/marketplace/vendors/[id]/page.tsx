"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Star, MapPin, Package, Loader2 } from "lucide-react";

interface VendorProfile {
  id: string;
  name: string;
  avatar?: string;
  vendorProfile?: {
    business_name?: string;
    about_me?: string;
    website?: string;
    social_links?: Record<string, string>;
  };
  listings: {
    id: string;
    title: string;
    price: number;
    price_unit: string;
    images: string[];
    category?: { name: string };
  }[];
  avgRating: number;
  totalReviews: number;
}

export default function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    MarketplaceService.getVendorProfile(id)
      .then((res) => {
        if (res.data?.success) {
          setVendor(res.data.data);
        } else {
          router.push("/marketplace");
        }
      })
      .catch(() => router.push("/marketplace"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!vendor) return null;

  const profile = vendor.vendorProfile;
  const displayName = profile?.business_name || vendor.name;
  const initials = displayName?.[0]?.toUpperCase() ?? "V";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/marketplace"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>

        {/* Profile header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {vendor.avatar ? (
              <Image
                src={vendor.avatar}
                alt={displayName}
                width={96}
                height={96}
                className="rounded-full object-cover border-4 border-primary/20 flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white font-bold text-3xl flex-shrink-0">
                {initials}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
              {profile?.business_name && vendor.name !== profile.business_name && (
                <p className="text-sm text-gray-500 mt-0.5">{vendor.name}</p>
              )}

              {/* Rating */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${
                        s <= Math.round(vendor.avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-gray-200 text-gray-200 dark:fill-gray-600 dark:text-gray-600"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {vendor.avgRating?.toFixed(1) ?? "—"}
                </span>
                <span className="text-sm text-gray-400">
                  ({vendor.totalReviews} review{vendor.totalReviews !== 1 ? "s" : ""})
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  {vendor.listings?.length ?? 0} active service{vendor.listings?.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* About */}
          {profile?.about_me && (
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">About</h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {profile.about_me}
              </p>
            </div>
          )}

          {/* Website */}
          {profile?.website && (
            <div className="mt-4">
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                {profile.website}
              </a>
            </div>
          )}
        </div>

        {/* Listings */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Services</h2>

          {!vendor.listings?.length ? (
            <div className="text-center py-12 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No active services yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {vendor.listings.map((listing) => (
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
                      <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">🖼️</div>
                    )}
                  </div>

                  <div className="p-4">
                    {listing.category && (
                      <span className="text-xs text-primary font-medium">{listing.category.name}</span>
                    )}
                    <h3 className="font-semibold text-gray-900 dark:text-white mt-1 line-clamp-2">
                      {listing.title}
                    </h3>
                    <p className="mt-2 font-bold text-gray-900 dark:text-white">
                      ${Number(listing.price).toFixed(2)}
                      <span className="text-xs font-normal text-gray-400 ml-1">/{listing.price_unit}</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
