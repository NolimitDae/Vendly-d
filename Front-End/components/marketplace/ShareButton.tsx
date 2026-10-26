"use client";

import { Share2 } from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

/** The full address of a page on this site, e.g. /marketplace/abc -> https://vendlymarketplace.com/marketplace/abc. */
export const siteUrl = (path: string) =>
  `${typeof window !== "undefined" ? window.location.origin : "https://vendlymarketplace.com"}${path}`;

/**
 * Shares a page: the phone's or browser's share sheet when there is one (Messages, WhatsApp, ...),
 * else the link is copied. `icon` shows a round icon-only button (next to the save heart).
 */
export default function ShareButton({
  path,
  title,
  text,
  label = "Share",
  icon = false,
  className,
}: {
  path: string;
  title: string;
  text?: string;
  label?: string;
  icon?: boolean;
  className?: string;
}) {
  const share = async () => {
    const url = siteUrl(path);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // closing the share sheet isn't an error; anything else falls back to copying
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.info(url);
    }
  };

  return icon ? (
    <button
      type="button"
      onClick={share}
      aria-label={label}
      title={label}
      className={cn(
        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-primary hover:text-primary",
        className,
      )}
    >
      <Share2 className="w-5 h-5" />
    </button>
  ) : (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700",
        className,
      )}
    >
      <Share2 className="w-4 h-4" />
      {label}
    </button>
  );
}
