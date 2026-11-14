"use client";

import Image from "next/image";
import { ChevronRight, Loader2, Package, Tags } from "lucide-react";
import dayjs from "dayjs";
import type { Quote } from "@/service/chat/chat.service";

const STATUS: Record<string, { label: string; className: string }> = {
  ACCEPTED: { label: "Accepted · booking requested", className: "text-green-600 dark:text-green-400" },
  DECLINED: { label: "Declined", className: "text-red-500" },
  WITHDRAWN: { label: "Withdrawn by the vendor", className: "text-gray-400" },
  EXPIRED: { label: "Expired", className: "text-gray-400" },
};

/** A vendor's custom price in chat. The customer accepts (opens the booking request at that price) or declines. */
export default function QuoteCard({
  quote,
  role,
  busy,
  onAccept,
  onDecline,
  onWithdraw,
  onOpen,
}: {
  quote: Quote;
  role: "customer" | "vendor" | "other";
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  /** tapping the card: the booking it became, or (still open) the booking flow at this price */
  onOpen?: () => void;
}) {
  const st = STATUS[quote.status];
  return (
    <div
      className={`w-72 rounded-2xl border border-primary/30 bg-white dark:bg-gray-800 p-4 space-y-3 shadow-sm ${onOpen ? "cursor-pointer hover:border-primary/60 transition" : ""}`}
      {...(onOpen
        ? {
            role: "link",
            tabIndex: 0,
            "aria-label": quote.booking_id ? `View the booking for ${quote.title}` : `Book ${quote.title}`,
            // the buttons inside keep their own actions
            onClick: (e: React.MouseEvent) => {
              if ((e.target as HTMLElement).closest("button")) return;
              onOpen();
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                onOpen();
              }
            },
          }
        : {})}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <Tags className="w-3.5 h-3.5" /> Custom quote
      </p>
      <div className="flex items-center gap-3">
        <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center">
          {quote.listing?.image ? <Image src={quote.listing.image} alt="" fill className="object-cover" unoptimized /> : <Package className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2">{quote.title}</p>
          {quote.listing && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{quote.listing.title}</p>}
        </div>
        <p className="text-lg font-bold text-gray-900 dark:text-white">${quote.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      </div>
      {quote.description && <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{quote.description}</p>}
      {st ? (
        <p className={`text-sm font-medium flex items-center justify-between gap-2 ${st.className}`}>
          {st.label}
          {quote.booking_id && onOpen && (
            <span className="flex items-center text-xs font-semibold text-primary">
              View booking <ChevronRight className="w-3.5 h-3.5" />
            </span>
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-400">Valid until {dayjs(quote.expires_at).format("ddd D MMM")}</p>
          {role === "customer" && (
            <div className="flex gap-2">
              <button onClick={onDecline} disabled={busy} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm">Decline</button>
              <button onClick={onAccept} disabled={busy} className="flex-1 px-3 py-2 rounded-xl gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Accept & book
              </button>
            </div>
          )}
          {role === "vendor" && (
            <button onClick={onWithdraw} disabled={busy} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm">Withdraw quote</button>
          )}
        </>
      )}
    </div>
  );
}
