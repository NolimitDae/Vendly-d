"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Bell, Check, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

const EVENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_REQUEST: "Booking",
  BOOKING_CONFIRMED: "Booking",
  BOOKING_CANCELLED: "Booking",
  BOOKING_COMPLETED: "Booking",
  NEW_MESSAGE: "Message",
  REVIEW_RECEIVED: "Review",
  PAYMENT_RECEIVED: "Payment",
};

const FILTERS = ["All", "Booking", "Message", "Review", "Payment"] as const;
type Filter = (typeof FILTERS)[number];

export default function NotificationsPage() {
  const { notifications, unread, loading, markAsRead, markAllAsRead, removeNotification } =
    useNotifications();
  const [filter, setFilter] = useState<Filter>("All");

  const filtered =
    filter === "All"
      ? notifications
      : notifications.filter(
          (n) =>
            (EVENT_TYPE_LABELS[n.notification_event?.type] ?? "Other") === filter,
        );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
            {unread > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80 transition"
            >
              <Check className="w-4 h-4" />
              Mark all as read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium border transition",
                filter === f
                  ? "bg-primary text-white border-primary"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/50",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3 p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-400 text-sm">
                {filter === "All" ? "No notifications yet" : `No ${filter.toLowerCase()} notifications`}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 p-4 group transition",
                    !n.read_at && "bg-primary/5 dark:bg-primary/10",
                    n.read_at && "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                  )}
                >
                  {/* Avatar */}
                  {n.sender?.avatar ? (
                    <Image
                      src={n.sender.avatar}
                      alt={n.sender.name}
                      width={40}
                      height={40}
                      className="rounded-full w-10 h-10 object-cover flex-shrink-0 mt-0.5"
                      unoptimized
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0 mt-0.5">
                      {n.sender?.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    {n.notification_event?.type && (
                      <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-primary/70 mb-0.5">
                        {EVENT_TYPE_LABELS[n.notification_event.type] ?? n.notification_event.type}
                      </span>
                    )}
                    <p
                      className={cn(
                        "text-sm leading-snug",
                        !n.read_at
                          ? "text-gray-900 dark:text-white font-medium"
                          : "text-gray-600 dark:text-gray-300",
                      )}
                    >
                      {n.notification_event?.text ?? "New notification"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{dayjs(n.created_at).fromNow()}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {!n.read_at && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        title="Mark as read"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition opacity-0 group-hover:opacity-100"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeNotification(n.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {!n.read_at && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 ml-1" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
