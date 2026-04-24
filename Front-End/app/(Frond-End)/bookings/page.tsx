"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { BookingService } from "@/service/booking/booking.service";
import { ReviewService } from "@/service/review/review.service";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
  CreditCard,
} from "lucide-react";
import { toast } from "react-toastify";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  REJECTED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

interface Booking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
  amount?: number;
  currency?: string;
  message?: string;
  listing?: { id: string; title: string; price: number; images: string[] };
  vendor?: { id: string; name: string; avatar_url?: string };
  review?: { id: string; rating: number } | null;
}

export default function CustomerBookingsPage() {
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<{ bookingId: string } | null>(null);

  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      toast.success("Payment successful! Your booking is confirmed.");
    } else if (payment === "cancelled") {
      toast.info("Payment cancelled. You can pay from your bookings page.");
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await BookingService.getMyAsCustomer({
        page,
        status: statusFilter || undefined,
      });
      if (res.data?.success) {
        setBookings(res.data.data);
        setMeta(res.data.meta);
      }
    } catch {
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handlePayNow = async (id: string) => {
    setPayingId(id);
    try {
      const res = await BookingService.createCheckout(id);
      if (res.data?.success && res.data.data?.checkout_url) {
        window.location.href = res.data.data.checkout_url;
      } else {
        toast.error(res.data?.message || "Failed to open payment");
        setPayingId(null);
      }
    } catch {
      toast.error("Payment initiation failed");
      setPayingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    setCancellingId(id);
    try {
      const res = await BookingService.cancel(id, "Customer cancelled");
      if (res.data?.success) {
        toast.success("Booking cancelled");
        fetchBookings();
      } else {
        toast.error(res.data?.message || "Failed to cancel");
      }
    } catch {
      toast.error("Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Bookings</h1>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {["", "PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                statusFilter === s
                  ? "bg-primary text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg">No bookings yet</p>
            <Link href="/marketplace" className="mt-3 inline-block text-primary hover:underline text-sm">
              Browse services
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-start gap-4">
                  {/* Listing image */}
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    {booking.listing?.images?.[0] ? (
                      <Image src={booking.listing.images[0]} alt="" fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-2xl">🖼️</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/marketplace/${booking.listing?.id}`}
                          className="font-semibold text-gray-900 dark:text-white hover:text-primary transition line-clamp-1"
                        >
                          {booking.listing?.title ?? "Service"}
                        </Link>
                        <p className="text-sm text-gray-500 mt-0.5">
                          by {booking.vendor?.name}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[booking.status] ?? ""}`}>
                        {booking.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(booking.created_at).toLocaleDateString()}
                      </span>
                      {booking.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(booking.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      {booking.amount && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          ${Number(booking.amount).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 flex-wrap">
                      {booking.status === "PENDING" && (
                        <button
                          onClick={() => handlePayNow(booking.id)}
                          disabled={payingId === booking.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition disabled:opacity-60"
                        >
                          {payingId === booking.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5" />
                          )}
                          Pay Now
                        </button>
                      )}
                      {["PENDING", "CONFIRMED"].includes(booking.status) && (
                        <button
                          onClick={() => handleCancel(booking.id)}
                          disabled={cancellingId === booking.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-600 border border-red-200 hover:bg-red-50 transition disabled:opacity-60"
                        >
                          {cancellingId === booking.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          Cancel
                        </button>
                      )}
                      {booking.status === "COMPLETED" && !booking.review && (
                        <button
                          onClick={() => setReviewModal({ bookingId: booking.id })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-amber-600 border border-amber-200 hover:bg-amber-50 transition"
                        >
                          <Star className="w-3.5 h-3.5" />
                          Leave Review
                        </button>
                      )}
                      {booking.status === "COMPLETED" && booking.review && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reviewed ({booking.review.rating}/5)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {Array.from({ length: meta.last_page }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  page === i + 1
                    ? "bg-primary text-white"
                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {reviewModal && (
        <QuickReviewModal
          bookingId={reviewModal.bookingId}
          onClose={() => setReviewModal(null)}
          onSubmitted={fetchBookings}
        />
      )}
    </div>
  );
}

function QuickReviewModal({
  bookingId,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await ReviewService.create({ booking_id: bookingId, rating, comment });
      if (res.data?.success) {
        toast.success("Review submitted!");
        onSubmitted();
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to submit review");
      }
    } catch {
      toast.error("Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Leave a Review</h2>
        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => setRating(s)}>
              <Star className={`w-8 h-8 transition ${s <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200 hover:text-amber-200"}`} />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Share your experience..."
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
        />
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
