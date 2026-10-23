"use client";

import { useEffect, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { toast } from "react-toastify";
import { ReviewService, type PendingReview } from "@/service/review/review.service";
import { cn } from "@/lib/utils";

const WORDS = ["", "Poor", "Not great", "Good", "Great", "Excellent"];

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

/** "How was it?" for the most recent finished booking that hasn't been rated, with an inline rating form. */
export default function ReviewPrompt({ className }: { className?: string }) {
  const [items, setItems] = useState<PendingReview[]>([]);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ReviewService.pending()
      .then((res) => setItems(res.data?.data ?? []))
      .catch(() => {});
  }, []);

  const current = items[0];
  if (!current) return null;
  const what = current.listing?.title ?? "your booking";

  const next = () => {
    setItems((list) => list.slice(1));
    setRating(0);
    setComment("");
  };

  const notNow = () => {
    ReviewService.dismiss(current.booking_id).catch(() => {});
    next();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setSaving(true);
    try {
      await ReviewService.create({ booking_id: current.booking_id, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      toast.success("Thanks for your review!");
      next();
    } catch (err) {
      toast.error(apiMessage(err, "Couldn't send your review. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || rating;

  return (
    <section
      aria-label={`Rate ${current.vendor.name}`}
      className={cn("bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-primary/30 p-5", className)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">How was {current.vendor.name}?</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{what}</p>
        </div>
        <button type="button" onClick={notNow} aria-label="Not now" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <fieldset>
          <legend className="sr-only">Your rating</legend>
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
        {rating > 0 && (
          <>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              aria-label="Your review"
              placeholder="What went well? Anything to improve? (optional)"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white resize-none text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Send review
            </button>
          </>
        )}
      </form>
    </section>
  );
}
