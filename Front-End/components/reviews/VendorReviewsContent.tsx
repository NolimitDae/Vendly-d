"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Loader2, MessageSquareReply, Star } from "lucide-react";
import { toast } from "react-toastify";
import { ReviewService, type VendorReview, type VendorReviewsMeta } from "@/service/review/review.service";

const MAX = 2000;
const PAGE_SIZE = 20;

function Stars({ rating, size = "w-4 h-4" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"}`} aria-hidden />
      ))}
    </span>
  );
}

/** A vendor's reviews: their average and count, each review, and a public reply (one per review). */
export default function VendorReviewsContent() {
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [meta, setMeta] = useState<VendorReviewsMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(false);
    try {
      const res = await ReviewService.mine({ page: p, limit: PAGE_SIZE });
      const rows: VendorReview[] = res.data?.data ?? [];
      setReviews((prev) => (p === 1 ? rows : [...prev, ...rows]));
      setMeta(res.data?.meta ?? null);
      setPage(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  const replied = (r: VendorReview) => {
    setReviews((list) => list.map((x) => (x.id === r.id ? { ...x, reply: r.reply } : x)));
    setMeta((m) => (m ? { ...m, unanswered: Math.max(0, m.unanswered - 1) } : m));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviews</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">What customers said about your work. Your reply shows under the review on your profile.</p>
        </div>

        {meta && meta.total > 0 && (
          <section aria-label="Summary" className="flex flex-wrap items-center gap-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{meta.avg_rating != null ? Number(meta.avg_rating).toFixed(1) : "–"}</p>
              <Stars rating={Number(meta.avg_rating ?? 0)} />
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <p>{meta.total} review{meta.total === 1 ? "" : "s"}</p>
              {meta.unanswered > 0 && <p className="text-amber-600 dark:text-amber-400">{meta.unanswered} waiting for your reply</p>}
            </div>
          </section>
        )}

        {loading && reviews.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="Loading" /></div>
        ) : error && reviews.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Couldn’t load your reviews.</p>
            <button type="button" onClick={() => load(1)} className="text-sm font-semibold text-primary">Try again</button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Star className="w-12 h-12 mx-auto mb-3 opacity-40" aria-hidden />
            <p className="font-medium text-gray-700 dark:text-gray-200">No reviews yet</p>
            <p className="text-sm">Customers can rate you once a booking is complete. Their reviews show up here.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onReplied={replied} />
            ))}
          </ul>
        )}

        {meta && page < meta.last_page && (
          <div className="flex justify-center">
            <button type="button" onClick={() => load(page + 1)} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm">
              {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Show more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review: r, onReplied }: { review: VendorReview; onReplied: (r: VendorReview) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const name = r.author?.name || "Customer";

  const send = async () => {
    const reply = text.trim();
    if (reply.length < 2) return;
    setSaving(true);
    try {
      await ReviewService.reply(r.id, reply);
      toast.success("Reply posted");
      setOpen(false);
      onReplied({ ...r, reply });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Couldn’t post your reply. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-3">
      <div className="flex items-start gap-3">
        {r.author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar from storage
          <img src={r.author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center" aria-hidden>{name[0]?.toUpperCase()}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900 dark:text-white">{name}</p>
            <time dateTime={r.created_at} className="text-xs text-gray-500 dark:text-gray-400">{dayjs(r.created_at).format("MMM D, YYYY")}</time>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Stars rating={r.rating} />
            {r.listing?.title && <span>· {r.listing.title}</span>}
          </div>
        </div>
      </div>
      {r.comment ? <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{r.comment}</p> : <p className="text-sm text-gray-400 italic">No written review</p>}

      {r.reply ? (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3 text-sm">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Your reply</p>
          <p className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{r.reply}</p>
        </div>
      ) : open ? (
        <div className="space-y-2">
          <label htmlFor={`reply-${r.id}`} className="text-sm font-medium text-gray-800 dark:text-gray-200">Reply to {name}</label>
          <textarea
            id={`reply-${r.id}`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder="Thank them, or answer what they said. Everyone who views your profile sees this."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">You can reply once, and the reply can’t be changed later.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
            <button type="button" onClick={send} disabled={saving || text.trim().length < 2} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Post reply
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <MessageSquareReply className="w-4 h-4" aria-hidden /> Reply
        </button>
      )}
    </li>
  );
}
