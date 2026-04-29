import { Star } from "lucide-react";

interface Props {
  rating: number;
  size?: "xs" | "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}

const SIZE = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export default function StarRating({ rating, size = "sm", showValue = false, className = "" }: Props) {
  const rounded = Math.round(rating * 2) / 2; // nearest 0.5

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.floor(rounded);
        const half = !filled && star - 0.5 === rounded;
        return (
          <span key={star} className="relative inline-flex">
            {/* Empty base star */}
            <Star className={`${SIZE[size]} text-gray-200 dark:text-gray-600`} />
            {/* Filled overlay */}
            {(filled || half) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? "100%" : "50%" }}
              >
                <Star className={`${SIZE[size]} fill-amber-400 text-amber-400`} />
              </span>
            )}
          </span>
        );
      })}
      {showValue && (
        <span className="ml-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          {rating.toFixed(1)}
        </span>
      )}
    </span>
  );
}
