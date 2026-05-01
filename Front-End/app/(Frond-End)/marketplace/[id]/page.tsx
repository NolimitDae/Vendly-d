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
  Heart,
  CalendarPlus,
  X,
  Loader2,
} from "lucide-react";
import BookingModal from "@/components/marketplace/BookingModal";
import ReviewList from "@/components/marketplace/ReviewList";
import { CookieHelper } from "@/helper/cookie.helper";
import { SavedListingsService } from "@/service/savedListings/savedListings.service";
import { AuthService } from "@/service/auth/auth.service";
import { EventsService } from "@/service/events/events.service";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

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
  reviews?: unknown[];
  _count?: { reviews: number; bookings: number };
}

interface EventOption {
  id: string;
  name: string;
  date?: string;
  status: string;
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [showBooking, setShowBooking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const isLoggedIn = !!CookieHelper.get({ key: "token" });

  // Event planner state
  const [userType, setUserType] = useState<string | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [showAddToEvent, setShowAddToEvent] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [linkingBooking, setLinkingBooking] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    MarketplaceService.getListing(id)
      .then((res) => {
        if (res.data?.success) setListing(res.data.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!isLoggedIn || !id) return;
    SavedListingsService.getSavedIds()
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setIsSaved(res.data.data.includes(id));
        }
      })
      .catch(() => {});
  }, [id, isLoggedIn]);

  // Load user type once
  useEffect(() => {
    if (!isLoggedIn) return;
    AuthService.me()
      .then((res) => {
        if (res.data?.success) setUserType(res.data.data.type);
      })
      .catch(() => {});
  }, [isLoggedIn]);

  // Fetch events when EP opens the modal
  const openAddToEventModal = async () => {
    setShowAddToEvent(true);
    if (events.length > 0) return;
    setLoadingEvents(true);
    try {
      const res = await EventsService.list({ limit: 50 });
      if (res.data?.success) {
        const active = (res.data.data as EventOption[]).filter(
          (e) => !["COMPLETED", "CANCELLED"].includes(e.status),
        );
        setEvents(active);
        if (active.length > 0) setSelectedEventId(active[0].id);
      }
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoadingEvents(false);
    }
  };

  // After booking is created, link it to the selected event
  const handleBookingCreated = async (bookingId: string) => {
    if (!selectedEventId) return;
    setPendingBookingId(bookingId);
  };

  // Triggered when BookingModal closes with a pending link
  const handleBookingModalClose = async () => {
    setShowBooking(false);
    if (pendingBookingId && selectedEventId) {
      setLinkingBooking(true);
      try {
        const res = await EventsService.linkBooking(selectedEventId, pendingBookingId);
        if (res.data?.success) {
          toast.success("Vendor added to your event!");
        } else {
          toast.error(res.data?.message || "Booking created but failed to link to event");
        }
      } catch {
        toast.error("Booking created but failed to link to event");
      } finally {
        setLinkingBooking(false);
        setPendingBookingId(null);
        setSelectedEventId("");
        setShowAddToEvent(false);
      }
    }
  };

  const toggleSave = async () => {
    if (!isLoggedIn) { toast.info("Log in to save listings"); return; }
    setSavingToggle(true);
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    try {
      if (wasSaved) {
        await SavedListingsService.remove(id);
        toast.success("Removed from saved listings");
      } else {
        await SavedListingsService.save(id);
        toast.success("Saved to your favourites");
      }
    } catch {
      setIsSaved(wasSaved);
      toast.error("Failed to update saved listings");
    } finally {
      setSavingToggle(false);
    }
  };

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

  const isEventPlanner = isLoggedIn && userType === "EVENT_PLANNER";

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

              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{listing.title}</h1>
                <button
                  onClick={toggleSave}
                  disabled={savingToggle}
                  aria-label={isSaved ? "Remove from saved" : "Save listing"}
                  className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition border",
                    isSaved
                      ? "bg-red-500 border-red-500 text-white"
                      : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-red-400 hover:text-red-500",
                  )}
                >
                  <Heart className={cn("w-5 h-5", isSaved && "fill-current")} />
                </button>
              </div>

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
                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => setShowBooking(true)}
                    className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary/90 transition"
                  >
                    Book Now
                  </button>

                  {isEventPlanner && (
                    <button
                      onClick={openAddToEventModal}
                      disabled={linkingBooking}
                      className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary py-3 rounded-xl font-semibold hover:bg-primary/5 transition disabled:opacity-60"
                    >
                      {linkingBooking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CalendarPlus className="w-4 h-4" />
                      )}
                      {linkingBooking ? "Linking…" : "Add to Event"}
                    </button>
                  )}
                </div>
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

      {/* Booking modal */}
      {showBooking && listing && (
        <BookingModal
          listing={listing}
          onClose={pendingBookingId ? handleBookingModalClose : () => setShowBooking(false)}
          onBookingCreated={selectedEventId ? handleBookingCreated : undefined}
        />
      )}

      {/* Add to Event modal */}
      {showAddToEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-primary" />
                Add to Event
              </h3>
              <button
                onClick={() => { setShowAddToEvent(false); setSelectedEventId(""); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Select an event, then book {listing.title} — it will be linked automatically.
            </p>

            {loadingEvents ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400 mb-3">No active events found.</p>
                <Link
                  href="/event-planner/events/new"
                  className="text-sm text-primary hover:underline"
                >
                  Create your first event →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Select Event
                  </label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowAddToEvent(false); setSelectedEventId(""); }}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedEventId}
                    onClick={() => { setShowAddToEvent(false); setShowBooking(true); }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    Continue to Book
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
