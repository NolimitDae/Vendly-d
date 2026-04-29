import Image from "next/image";
import StarRating from "./StarRating";

export interface Review {
  id: string;
  rating: number;
  comment?: string;
  reply?: string;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string | null };
}

interface Props {
  review: Review;
}

export default function ReviewCard({ review }: Props) {
  const name = review.author?.name ?? "Anonymous";
  const initial = name[0]?.toUpperCase() ?? "?";
  const date = new Date(review.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-5 last:pb-0">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {review.author?.avatar_url ? (
          <Image
            src={review.author.avatar_url}
            alt={name}
            width={40}
            height={40}
            className="rounded-full object-cover flex-shrink-0 w-10 h-10"
            unoptimized
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primaryColor/20 flex items-center justify-center text-primaryColor font-semibold text-sm flex-shrink-0">
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Name + date row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-blackColor dark:text-white text-sm">{name}</span>
            <span className="text-xs text-descriptionColor">{date}</span>
          </div>

          {/* Stars */}
          <StarRating rating={review.rating} size="xs" className="mt-0.5 mb-1.5" />

          {/* Comment */}
          {review.comment && (
            <p className="text-sm text-descriptionColor dark:text-gray-300 leading-relaxed">
              {review.comment}
            </p>
          )}

          {/* Vendor reply */}
          {review.reply && (
            <div className="mt-3 p-3 bg-grayBg dark:bg-gray-700/50 rounded-xl">
              <p className="text-xs font-semibold text-primaryColor mb-1">Vendor reply</p>
              <p className="text-sm text-descriptionColor dark:text-gray-300">{review.reply}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
