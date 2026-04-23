"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MarketplaceService } from "@/service/marketplace/marketplace.service";
import Image from "next/image";
import Link from "next/link";
import {
  Star,
  MapPin,
  Clock,
  Calendar,
  CheckCircle,
  ChevronLeft,
  MessageCircle,
} from "lucide-react";
import BookingModal from "@/components/marketplace/BookingModal";
import ReviewList from "@/components/marketplace/ReviewList";
import { CookieHelper } from "@/helper/cookie.helper";

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  images: string[];
  tags: string[];
  location?: string;
  availability?: string;
  delivery_time?: number;
  avg_rating?: number;
  category?: { id: string; name: string };
  sub_category?: { id: string; name: string };
  vendor?: {
    id: string;
    name: string;
    avatar_url?: string;
    created_at: string;
    vendorProfile?: { business_name?: string; about_me?: string; license_status?: string };
  };
  reviews?: any[];
  _count?: { reviews: number; bookings: number };
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showBooking, setShowBooking] = useState(false);
  const isLoggedIn = !!CookieHelper.get({ key: "token" });

  useEffect(() => {
    if (!id) return;
    MarketplaceService.getListing(id)
      .then((res) => {
        if (res.data?.success) setListing(res.data.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
        <p className="text-xl font-medium">Listing not found</p>
        <Link href="/marketplace" className="mt-4 text-primary hover:underline">
          Back to marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-6 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column: images + details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image gallery */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden">
              <div className="relative h-80 md:h-96 bg-gray-100 dark:bg-gray-700">
                {listing.images?.[activeImage] ? (
                  <Image
                    src={listing.images[activeImage]}
                    alt={listing.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-6xl">🖼️</div>
                )}
              </div>
              {listing.images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {listing.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                        activeImage === i ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <Image src={img} alt="" fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title + meta */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6">
              <div className="flex flex-wrap gap-2 mb-3">
                {listing.category && (
                  <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full">
                    {listing.category.name}
                  </span>
                )}
                {listing.sub_category && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full">
                    {listing.sub_category.name}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{listing.title}</h1>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                {listing.avg_rating && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="font-medium">{listing.avg_rating.toFixed(1)}</span>
                    <span className="text-gray-400">({listing._count?.reviews} reviews)</span>
                  </div>
                )}
                {listing.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {listing.location}
                  </div>
                )}
                {listing.delivery_time && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {listing.delivery_time} day{listing.delivery_time !== 1 ? "s" : ""} delivery
                  </div>
                )}
              </div>

              <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>

              {listing.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {listing.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {listing.availability && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium mb-1">
                    <Calendar className="w-4 h-4" />
                    Availability
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-300">{listing.availability}</p>
                </div>
              )}
            </div>

            {/* Reviews */}
            {listing.id && <ReviewList listingId={listing.id} />}
          </div>

          {/* Right column: pricing + vendor */}
          <div className="space-y-4">
            {/* Pricing card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm sticky top-24">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                ${Number(listing.price).toFixed(2)}
                <span className="text-base font-normal text-gray-400 ml-1">/ {listing.price_unit}</span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-500">
                {listing._count?.bookings !== undefined && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    {listing._count.bookings} bookings completed
                  </div>
                )}
              </div>

              {isLoggedIn ? (
                <button
                  onClick={() => setShowBooking(true)}
                  className="w-full mt-5 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition"
                >
                  Book Now
                </button>
              ) : (
                <Link
                  href="/login"
                  className="block w-full mt-5 bg-primary text-white py-3 rounded-xl font-semibold text-center hover:bg-primary/90 transition"
                >
                  Log in to Book
                </Link>
              )}
            </div>

            {/* Vendor card */}
            {listing.vendor && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  About the Vendor
                </h3>
                <div className="flex items-center gap-3">
                  {listing.vendor.avatar_url ? (
                    <Image
                      src={listing.vendor.avatar_url}
                      alt={listing.vendor.name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                      {listing.vendor.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {listing.vendor.vendorProfile?.business_name || listing.vendor.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      Member since {new Date(listing.vendor.created_at).getFullYear()}
                    </p>
                  </div>
                </div>

                {listing.vendor.vendorProfile?.about_me && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                    {listing.vendor.vendorProfile.about_me}
                  </p>
                )}

                <Link
                  href={`/marketplace/vendors/${listing.vendor.id}`}
                  className="flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  View full profile
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {showBooking && listing && (
        <BookingModal
          listing={listing}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  );
}
