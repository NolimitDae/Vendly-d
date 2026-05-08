"use client";

import { useEffect, useState, useCallback } from "react";
import { ReviewService } from "@/service/review/review.service";
import { BookingService } from "@/service/booking/booking.service";
import { CookieHelper } from "@/helper/cookie.helper";
import { Loader2, Star } from "lucide-react";
import ReviewCard, { Review } from "@/components/shared/ReviewCard";
import StarRating from "@/components/shared/StarRating";

interface Meta {
  total: number;
  page: number;
  last_page: number;
  avg_rating: number | null;
  distribution: Record<number, number> | null;
}

interface Props {
  listingId?: string;
  vendorId?: string;
}

export default function ReviewList({ listingId, vendorId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [eligibleBookingId, setEligibleBookingId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [submitting, setSubmitting] = useState(false);
  const isLoggedIn = !!CookieHelper.get({ key: "token" });

  const fetchReviews = useCallback(
    async (p: number, append: boolean) => {
      const fetcher = listingId
        ? ReviewService.getListingReviews(listingId, { page: p })
        : ReviewService.getVendorReviews(vendorId!, { page: p });
      const res = await fetcher;
      if (res.data?.success) {
        setReviews((prev) => (append ? [...prev, ...res.data.data] : res.data.data));
        setMeta(res.data.meta);
      }
    },
    [listingId, vendorId],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchReviews(1, false).finally(() => setLoading(false));
  }, [fetchReviews]);

  // Check if user can leave a review (listing only)
  useEffect(() => {
    if (!isLoggedIn || !listingId) return;
    BookingService.getMyAsCustomer({ status: "COMPLETED" })
      .then((res) => {
        if (res.data?.success) {
          const eligible = res.data.data.find(
            (b: any) => b.listing?.id === listingId && !b.review,
          );
          if (eligible) setEligibleBookingId(eligible.id);
        }
      })
      .catch(() => null);
  }, [listingId, isLoggedIn]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    await fetchReviews(next, true);
    setPage(next);
    setLoadingMore(false);
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eligibleBookingId) return;
    setSubmitting(true);
    try {
      const res = await ReviewService.create({
        booking_id: eligibleBookingId,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      if (res.data?.success) {
        setReviews((prev) => [res.data.data, ...prev]);
        setMeta((m) => m ? { ...m, total: m.total + 1 } : m);
        setEligibleBookingId(null);
        setReviewForm({ rating: 5, comment: "" });
      }
    } catch {
      // handled silently
    } finally {
      setSubmitting(false);
    }
  };

  const avg = meta?.avg_rating ?? 0;
  const total = meta?.total ?? 0;
  const dist = meta?.distribution ?? null;
  const hasMore = meta ? page < meta.last_page : false;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-6">
      {/* Section header */}
      <h2 className="text-lg font-bold text-blackColor dark:text-white">
        Reviews
        {total > 0 && (
          <span className="text-descriptionColor font-normal text-base ml-2">({total})</span>
        )}
      </h2>

      {/* Rating summary — only show when we have data */}
      {!loading && total > 0 && avg > 0 && (
        <div className="flex flex-col sm:flex-row gap-6 p-5 bg-grayBg dark:bg-gray-700/40 rounded-2xl">
          {/* Big number + stars */}
          <div className="flex flex-col items-center justify-center min-w-[100px]">
            <span className="text-5xl font-extrabold text-blackColor dark:text-white leading-none">
              {avg.toFixed(1)}
            </span>
            <StarRating rating={avg} size="md" className="mt-2" />
            <span className="text-xs text-descriptionColor mt-1">
              {total} review{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Bar breakdown */}
          {dist && (
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = dist[star] ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-0.5 w-6 text-descriptionColor justify-end">
                      {star}
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-descriptionColor">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Leave a review form (listing page only, logged-in users with completed booking) */}
      {eligibleBookingId && (
        <form
          onSubmit={submitReview}
          className="p-4 bg-primaryColor/5 dark:bg-primaryColor/10 rounded-xl space-y-3"
        >
          <h3 className="font-semibold text-blackColor dark:text-white text-sm">
            Leave a Review
          </h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewForm((f) => ({ ...f, rating: star }))}
                className="transition hover:scale-110"
              >
                <Star
                  className={`w-6 h-6 transition ${
                    star <= reviewForm.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-300 hover:text-amber-200"
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={reviewForm.comment}
            onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
            placeholder="Share your experience..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-borderColor dark:border-gray-700 bg-white dark:bg-gray-800 text-blackColor dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primaryColor/30 resize-none text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-primaryColor text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? "Submitting…" : "Submit Review"}
          </button>
        </form>
      )}

      {/* Review list */}
      {loading ? (
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-center text-descriptionColor py-10 text-sm">
          No reviews yet. Be the first!
        </p>
      ) : (
        <div className="space-y-5">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="pt-2 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-full border border-borderColor dark:border-gray-600 text-sm font-medium text-blackColor dark:text-white hover:bg-grayBg dark:hover:bg-gray-700 transition disabled:opacity-60 flex items-center gap-2 mx-auto"
          >
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loadingMore ? "Loading…" : "Load more reviews"}
          </button>
        </div>
      )}
    </div>
  );
}
