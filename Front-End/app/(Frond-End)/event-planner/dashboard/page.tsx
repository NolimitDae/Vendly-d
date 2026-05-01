"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckSquare,
  DollarSign,
  Plus,
  ArrowRight,
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
  _count: { bookings: number; tasks: number; budget_items: number };
}

const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  CANCELLED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function EventPlannerDashboardPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    EventsService.list({ limit: 20 })
      .then((res) => {
        if (res.data?.success) setEvents(res.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = events.filter((e) =>
    ["PLANNING", "CONFIRMED", "IN_PROGRESS"].includes(e.status),
  );
  const completed = events.filter((e) => e.status === "COMPLETED");
  const upcoming = events
    .filter((e) => e.date && new Date(e.date) > new Date())
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
    .slice(0, 5);

  const totalVendors = events.reduce((s, e) => s + e._count.bookings, 0);
  const totalTasks = events.reduce((s, e) => s + e._count.tasks, 0);

  return (
    <section className="py-10 sm:py-16 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Event Planner Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage your events, vendors, budgets and tasks
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

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total Events",
              value: events.length,
              icon: ClipboardList,
              color: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-50 dark:bg-purple-900/20",
            },
            {
              label: "Active",
              value: active.length,
              icon: Calendar,
              color: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-50 dark:bg-blue-900/20",
            },
            {
              label: "Vendors Booked",
              value: totalVendors,
              icon: DollarSign,
              color: "text-green-600 dark:text-green-400",
              bg: "bg-green-50 dark:bg-green-900/20",
            },
            {
              label: "Tasks Created",
              value: totalTasks,
              icon: CheckSquare,
              color: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-50 dark:bg-amber-900/20",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", bg)}>
                <Icon className={cn("w-5 h-5", color)} />
              </div>
              {loading ? (
                <div className="h-7 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Events */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Upcoming Events</h2>
              <Link
                href="/event-planner/events"
                className="text-xs text-primary hover:opacity-80 transition flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-6 py-4 animate-pulse flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400">No upcoming events</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {upcoming.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={`/event-planner/events/${ev.id}`}
                      className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {ev.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {ev.date ? dayjs(ev.date).format("MMM D, YYYY") : "No date set"}
                          {ev.venue ? ` · ${ev.venue}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                          STATUS_STYLES[ev.status] ?? "bg-gray-100 text-gray-500",
                        )}
                      >
                        {STATUS_LABEL[ev.status] ?? ev.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {[
                {
                  href: "/event-planner/events/new",
                  icon: Plus,
                  label: "Create a new event",
                  desc: "Plan a wedding, party, corporate event & more",
                  color: "bg-primary/10 text-primary",
                },
                {
                  href: "/event-planner/events",
                  icon: ClipboardList,
                  label: "View all events",
                  desc: `${events.length} event${events.length !== 1 ? "s" : ""} total`,
                  color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
                },
                {
                  href: "/marketplace",
                  icon: DollarSign,
                  label: "Browse vendors",
                  desc: "Find and book services for your events",
                  color: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
                },
                {
                  href: "/event-planner/profile",
                  icon: CheckSquare,
                  label: "Update my profile",
                  desc: "Edit your event planner portfolio",
                  color: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
                },
              ].map(({ href, icon: Icon, label, desc, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition group"
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                    <p className="text-xs text-gray-400 truncate">{desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary transition flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Completed Events */}
        {!loading && completed.length > 0 && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
              Completed Events ({completed.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {completed.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/event-planner/events/${ev.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-primary/30 hover:bg-primary/5 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {ev.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {ev.date ? dayjs(ev.date).format("MMM D, YYYY") : "—"}
                    </p>
                  </div>
                  <Loader2 className="w-0 h-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
