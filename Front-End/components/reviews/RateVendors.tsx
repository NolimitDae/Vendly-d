"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Star } from "lucide-react";
import { toast } from "react-toastify";
import { ReviewService, type EventVendorReview, type EventVendorReviews } from "@/service/review/review.service";
import { cn } from "@/lib/utils";

const WORDS = ["", "Poor", "Not great", "Good", "Great", "Excellent"];

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

/** "Rate your vendors": every completed booking on the event in one place, rated ones shown, the rest rateable here. */
export default function RateVendors({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventVendorReviews | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ReviewService.forEvent(eventId)
      .then((res) => setData(res.data?.data ?? null))
      .catch((e) => setError(apiMessage(e, "We couldn't load this event's vendors.")));
  }, [eventId]);

  // a review just sent: show it as done and count one fewer to rate
  const reviewed = (bookingId: string, review: NonNullable<EventVendorReview["review"]>) =>
    setData((d) =>
      d ? { ...d, to_rate: Math.max(0, d.to_rate - 1), items: d.items.map((i) => (i.booking_id === bookingId ? { ...i, review } : i)) } : d,
    );

  const back = (
    <Link
      href={`/event-planner/events/${eventId}`}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition dark:text-gray-400"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to event
    </Link>
  );

  if (error) {
    return (
      <div>
        {back}
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </div>
    );
  }
  if (!data) return <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mt-16" aria-label="Loading" />;

  const total = data.items.length;
  return (
    <div>
      {back}
      <header className="mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">{data.event.name}</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rate your vendors</h1>
        {total > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data.to_rate === 0 ? "All done. Thanks for rating everyone." : `${total - data.to_rate} of ${total} rated`}
          </p>
        )}
      </header>

      {total === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-10 text-center">
          <Star className="w-9 h-9 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nothing to rate yet. Vendors show up here once their booking on this event is completed.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {data.items.map((item) => (
            <li key={item.booking_id}>
              <VendorReviewCard item={item} onReviewed={reviewed} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VendorReviewCard({
  item,
  onReviewed,
}: {
  item: EventVendorReview;
  onReviewed: (bookingId: string, review: NonNullable<EventVendorReview["review"]>) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const { vendor, listing, review } = item;
  const what = [listing?.category, listing?.title].filter(Boolean).join(" · ");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setSaving(true);
    try {
      const text = comment.trim();
      const res = await ReviewService.create({ booking_id: item.booking_id, rating, ...(text ? { comment: text } : {}) });
      const saved = res.data?.data;
      toast.success(`Thanks! Your review of ${vendor.name} is up.`);
      onReviewed(item.booking_id, { id: saved?.id ?? "", rating, comment: text || null, created_at: saved?.created_at ?? new Date().toISOString() });
    } catch (err) {
      toast.error(apiMessage(err, "Couldn't send your review. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || rating;
  return (
    <section
      aria-label={vendor.name}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-2xl border p-5",
        review ? "border-gray-100 dark:border-gray-700" : "border-primary/30",
      )}
    >
      <div className="flex items-center gap-3">
        {vendor.avatar_url ? (
          <Image src={vendor.avatar_url} alt="" width={44} height={44} className="w-11 h-11 rounded-full object-cover" unoptimized />
        ) : (
          <div className="w-11 h-11 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center">
            {vendor.name[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">{vendor.name}</h2>
          {what && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{what}</p>}
        </div>
        {review && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" /> Reviewed
          </span>
        )}
      </div>

      {review ? (
        <div className="mt-3">
          <div className="flex items-center gap-0.5" role="img" aria-label={`Rated ${review.rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={cn("w-5 h-5", n <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600")} />
            ))}
          </div>
          {review.comment && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{review.comment}</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <fieldset>
            <legend className="sr-only">Your rating for {vendor.name}</legend>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={rating === n}
                  className="p-0.5"
                >
                  <Star className={cn("w-7 h-7", n <= shown ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600")} />
                </button>
              ))}
              {shown > 0 && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{WORDS[shown]}</span>}
            </div>
          </fieldset>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-label={`Your review of ${vendor.name}`}
            placeholder="Write a quick review (optional)"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none text-sm"
          />
          <button
            type="submit"
            disabled={!rating || saving}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Send review
          </button>
        </form>
      )}
    </section>
  );
}
