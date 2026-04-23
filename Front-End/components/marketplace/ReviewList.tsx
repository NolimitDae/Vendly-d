"use client";

import { useEffect, useState } from "react";
import { ReviewService } from "@/service/review/review.service";
import { Star } from "lucide-react";
import Image from "next/image";
import { CookieHelper } from "@/helper/cookie.helper";
import { BookingService } from "@/service/booking/booking.service";

interface Review {
  id: string;
  rating: number;
  comment?: string;
  reply?: string;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string };
}

interface Props {
  listingId: string;
}

export default function ReviewList({ listingId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [eligibleBookingId, setEligibleBookingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isLoggedIn = !!CookieHelper.get({ key: "token" });

  useEffect(() => {
    setLoading(true);
    ReviewService.getListingReviews(listingId, { page })
      .then((res) => {
        if (res.data?.success) {
          setReviews(res.data.data);
          setTotal(res.data.meta.total);
          setLastPage(res.data.meta.last_page);
          setAvgRating(res.data.meta.avg_rating);
        }
      })
      .finally(() => setLoading(false));
  }, [listingId, page]);

  useEffect(() => {
    if (!isLoggedIn) return;
    BookingService.getMyAsCustomer({ status: "COMPLETED" })
      .then((res) => {
        if (res.data?.success) {
          const eligible = res.data.data.find(
            (b: any) => b.listing?.id === listingId && !b.review
          );
          if (eligible) setEligibleBookingId(eligible.id);
        }
      })
      .catch(() => null);
  }, [listingId, isLoggedIn]);

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
        setTotal((t) => t + 1);
        setEligibleBookingId(null);
      }
    } catch {
      // handled
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Reviews
          {total > 0 && <span className="text-gray-400 font-normal text-base ml-2">({total})</span>}
        </h2>
        {avgRating && (
          <div className="flex items-center gap-1.5">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${star <= Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                />
              ))}
            </div>
            <span className="font-bold text-gray-900 dark:text-white">{avgRating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Leave a review */}
      {eligibleBookingId && (
        <form onSubmit={submitReview} className="mb-6 p-4 bg-primary/5 rounded-xl">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Leave a Review</h3>
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewForm((f) => ({ ...f, rating: star }))}
              >
                <Star
                  className={`w-6 h-6 transition ${
                    star <= reviewForm.rating ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-200"
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
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No reviews yet. Be the first!</p>
      ) : (
        <div className="space-y-5">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex gap-2 mt-5 justify-center">
          {Array.from({ length: lastPage }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-8 h-8 rounded-lg text-sm transition ${
                page === i + 1 ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-5 last:pb-0">
      <div className="flex items-start gap-3">
        {review.author?.avatar_url ? (
          <Image
            src={review.author.avatar_url}
            alt={review.author.name}
            width={40}
            height={40}
            className="rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium flex-shrink-0">
            {review.author?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900 dark:text-white text-sm">
              {review.author?.name ?? "Anonymous"}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(review.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex mt-0.5 mb-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3.5 h-3.5 ${star <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
              />
            ))}
          </div>
          {review.comment && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>
          )}
          {review.reply && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm">
              <span className="font-medium text-primary">Vendor reply: </span>
              <span className="text-gray-600 dark:text-gray-300">{review.reply}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
