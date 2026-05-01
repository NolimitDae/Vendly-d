"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Plus,
  MapPin,
  Users,
  DollarSign,
  ChevronRight,
  Loader2,
  ClipboardList,
} from "lucide-react";
import dayjs from "dayjs";
import { EventsService } from "@/service/events/events.service";
import { cn } from "@/lib/utils";

interface EventSummary {
  id: string;
  name: string;
  type?: string;
  date?: string;
  venue?: string;
  status: string;
  total_budget?: number;
  guest_count?: number;
  _count: { bookings: number; tasks: number; budget_items: number };
}

const STATUS_FILTERS = [
  "All",
  "Planning",
  "Confirmed",
  "In Progress",
  "Completed",
  "Cancelled",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_PARAM: Record<StatusFilter, string | undefined> = {
  All: undefined,
  Planning: "PLANNING",
  Confirmed: "CONFIRMED",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
};

const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  CANCELLED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_LABEL: Record<string, string> = {
  WEDDING: "Wedding",
  BIRTHDAY: "Birthday",
  CORPORATE: "Corporate",
  CONCERT: "Concert",
  CONFERENCE: "Conference",
  PRIVATE_PARTY: "Private Party",
  OTHER: "Other",
};

export default function EventPlannerEventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("All");

  useEffect(() => {
    setLoading(true);
    EventsService.list({ status: STATUS_PARAM[filter], limit: 50 })
      .then((res) => {
        if (res.data?.success) setEvents(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <section className="py-10 sm:py-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              My Events
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {loading ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link
            href="/event-planner/events/new"
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" />
            New Event
          </Link>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap mb-6">
          {STATUS_FILTERS.map((f) => (
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
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-2xl p-5 animate-pulse border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <ClipboardList className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No events yet
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-5">
              Create your first event to start planning vendors, budget and tasks.
            </p>
            <Link
              href="/event-planner/events/new"
              className="gradient-bg text-white font-semibold px-7 py-2.5 rounded-full text-sm hover:opacity-90 transition"
            >
              Create Event
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/event-planner/events/${ev.id}`}
                className="block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:border-primary/30 hover:shadow-md transition p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {ev.name}
                      </h3>
                      {ev.type && (
                        <span className="text-xs text-gray-400">
                          {TYPE_LABEL[ev.type] ?? ev.type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-1 rounded-full",
                        STATUS_STYLES[ev.status] ?? "bg-gray-100 text-gray-500",
                      )}
                    >
                      {ev.status.replace("_", " ")}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
                  {ev.date && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {dayjs(ev.date).format("MMM D, YYYY")}
                    </div>
                  )}
                  {ev.venue && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {ev.venue}
                    </div>
                  )}
                  {ev.guest_count && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {ev.guest_count} guests
                    </div>
                  )}
                  {ev.total_budget && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      ${Number(ev.total_budget).toLocaleString()} budget
                    </div>
                  )}
                </div>

                <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
                  <span>{ev._count.bookings} vendor{ev._count.bookings !== 1 ? "s" : ""}</span>
                  <span>{ev._count.tasks} task{ev._count.tasks !== 1 ? "s" : ""}</span>
                  <span>{ev._count.budget_items} budget item{ev._count.budget_items !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
