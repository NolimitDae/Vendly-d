"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, FileCheck2, FileX2, MessageSquare, Package, Receipt, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueByText } from "@/lib/booking-status";
import { categoryLabel } from "@/components/disputes/DisputeDetails";
import type { AttentionItem, AttentionKind } from "@/service/vendor/vendor-dashboard.service";

const HOUR = 3600 * 1000;
const money = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 days 4 hours", "5 hours", "less than an hour" until a time. */
export function timeLeft(at: string | Date, now = new Date()): string {
  const ms = new Date(at).getTime() - now.getTime();
  if (ms < HOUR) return "less than an hour";
  const hours = Math.floor(ms / HOUR);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${plural(days, "day")} ${plural(rest, "hour")}` : plural(days, "day");
}

interface Row {
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
  href: string;
  /** closes or must be paid within 12 hours */
  urgent?: boolean;
}

/** What a row says and where its button goes. */
export function attentionRow(item: AttentionItem, now = new Date()): Row {
  const who = item.customer_name || "The customer";
  const pkg = item.title || "the booking";
  const booking = item.booking_id ? `/vendor/bookings/${item.booking_id}` : "/vendor/bookings";
  const soon = !!item.at && new Date(item.at).getTime() - now.getTime() < 12 * HOUR;
  const closes = item.at ? ` Closes in ${timeLeft(item.at, now)}.` : "";
  const kinds: Record<AttentionKind, () => Row> = {
    request: () => ({
      icon: CalendarClock,
      title: `Booking request from ${who}`,
      body: `${pkg}. Accept or decline it.${closes}`,
      action: "Review request",
      href: booking,
      urgent: soon,
    }),
    changes_approved: () => ({
      icon: FileCheck2,
      title: `${who} approved your changes`,
      body: `${pkg}. Accept the booking to confirm it.${closes}`,
      action: "Accept booking",
      href: booking,
      urgent: soon,
    }),
    changes_declined: () => ({
      icon: FileX2,
      title: `${who} declined your changes`,
      body: `${pkg}. Their original request still stands: accept or decline it.${closes}`,
      action: "Review request",
      href: booking,
      urgent: soon,
    }),
    payment: () => {
      if (item.detail === "deposit" || item.detail === "balance") {
        return {
          icon: CreditCard,
          title: `${who}'s ${item.detail} didn't go through`,
          body: `${pkg}. They have until ${item.at ? dueByText(item.at) : "the deadline"} to pay, or the booking is cancelled.`,
          action: "View booking",
          href: booking,
          urgent: soon,
        };
      }
      const what = `${item.amount != null ? `${money(item.amount)} ` : ""}${item.detail ? `for ${item.detail}` : "charge"}`.trim();
      return {
        icon: CreditCard,
        title: `A payment from ${who} didn't go through`,
        body: `${pkg}: ${what}. ${item.done ? "We'll try the card again." : "Ask them to update their card."}`,
        action: "View booking",
        href: booking,
      };
    },
    dispute: () => ({
      icon: AlertTriangle,
      title: `${who} reported a problem`,
      body: `${pkg}${item.detail ? `: ${categoryLabel(item.detail)}` : ""}. ${item.done ? "You replied. Vendly is looking into it." : "Reply with your side so Vendly can help."}`,
      action: item.done ? "View complaint" : "Reply",
      href: booking,
    }),
    rental_return: () => ({
      icon: Package,
      title: `Check in ${pkg}`,
      body: `Due back ${item.at ? dayjs(item.at).format("ddd, MMM D") : "already"} from ${who}. Record the return so the deposit hold is settled.`,
      action: "Check in",
      href: booking,
    }),
    extra_waiting: () => ({
      icon: Receipt,
      title: `${item.detail ?? "An add-on or fee"}${item.amount != null ? ` (${money(item.amount)})` : ""} is waiting for ${who}`,
      body: `${pkg}. Sent ${item.at ? dayjs(item.at).format("MMM D") : "earlier"}. You can remind them from the booking.`,
      action: "View booking",
      href: booking,
    }),
    unread_chats: () => ({
      icon: MessageSquare,
      title: `${plural(item.messages ?? 0, "unread message")}`,
      body: `In ${plural(item.chats ?? 0, "chat")}.`,
      action: "Open messages",
      href: "/chat",
    }),
  };
  return kinds[item.kind]();
}

/** The dashboard's "Needs your attention" list: one row per thing to do, each with a button to the right page. */
export default function AttentionList({ items, loading = false, now }: { items: AttentionItem[]; loading?: boolean; now?: Date }) {
  const at = now ?? new Date();
  return (
    <section aria-labelledby="attention-heading" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id="attention-heading" className="text-lg font-semibold text-gray-900 dark:text-white">
          Needs your attention
        </h2>
        {!loading && items.length > 0 && (
          <span className="min-w-[24px] h-6 px-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {items.length}
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700/60 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 gap-2">
          <CheckCircle2 className="w-10 h-10 text-green-500" aria-hidden />
          <p className="font-medium text-gray-900 dark:text-white">You&apos;re all caught up</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item, i) => {
            const row = attentionRow(item, at);
            const Icon = row.icon;
            return (
              <li key={`${item.kind}-${item.booking_id ?? i}-${i}`} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                      row.urgent ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" : "bg-primary/10 text-primary dark:text-orchid-300",
                    )}
                  >
                    <Icon className="w-4 h-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{row.title}</p>
                    <p className={cn("text-sm", row.urgent ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400")}>{row.body}</p>
                  </div>
                </div>
                <Link
                  href={row.href}
                  aria-label={`${row.action}: ${row.title}`}
                  className="self-start sm:self-center inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 whitespace-nowrap"
                >
                  {row.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
