"use client";

import { DISPUTE_CATEGORY_LABELS, DISPUTE_OUTCOME_LABELS, type DisputeCategory, type DisputeOutcome } from "@/service/payments/payments.service";

export interface DisputeDetailFields {
  dispute_category?: string | null;
  dispute_outcome?: string | null;
  dispute_requested_amount?: number | string | null;
  /** short-lived signed links from the API */
  dispute_photo_urls?: string[] | null;
}

export const categoryLabel = (c?: string | null) => (c ? DISPUTE_CATEGORY_LABELS[c as DisputeCategory] ?? c : null);

export function outcomeLabel(o?: string | null, amount?: number | string | null) {
  if (!o) return null;
  const base = DISPUTE_OUTCOME_LABELS[o as DisputeOutcome] ?? o;
  return o === "partial_refund" && amount != null && amount !== "" ? `${base} of $${Number(amount).toFixed(2)}` : base;
}

/** Category, what the customer asks for and their photos (thumbnails open full size). */
export default function DisputeDetails({ d, who = "The customer" }: { d: DisputeDetailFields; who?: string }) {
  const category = categoryLabel(d.dispute_category);
  const outcome = outcomeLabel(d.dispute_outcome, d.dispute_requested_amount);
  const photos = d.dispute_photo_urls ?? [];
  if (!category && !outcome && photos.length === 0) return null;
  return (
    <div className="space-y-2 text-sm">
      {(category || outcome) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          {category && (
            <div className="flex gap-1.5">
              <dt className="text-gray-500 dark:text-gray-400">Problem:</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{category}</dd>
            </div>
          )}
          {outcome && (
            <div className="flex gap-1.5">
              <dt className="text-gray-500 dark:text-gray-400">{who === "You" ? "You asked for:" : "Asks for:"}</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{outcome}</dd>
            </div>
          )}
        </dl>
      )}
      {photos.length > 0 && (
        <ul aria-label={`${who === "You" ? "Your" : "The customer’s"} photos`} className="flex flex-wrap gap-2">
          {photos.map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed link */}
                <img src={url} alt={`Photo ${i + 1} of ${photos.length}`} className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
