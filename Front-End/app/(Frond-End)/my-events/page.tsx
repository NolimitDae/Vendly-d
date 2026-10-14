"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarHeart, ChevronRight, Loader2 } from "lucide-react";
import dayjs from "dayjs";
import { EventToolsService } from "@/service/events/eventTools.service";

type Shared = { id: string; name: string; date?: string | null; venue?: string | null; status: string; event_planner: { id: string; name: string } };

/** Events a planner has shared with this user as their client. */
export default function SharedEventsPage() {
  const [events, setEvents] = useState<Shared[] | null>(null);
  useEffect(() => {
    EventToolsService.shared().then((r) => setEvents(r.data?.data ?? [])).catch(() => setEvents([]));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shared events</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Events your planner has shared with you: vendors, the run of show and files.</p>
        {!events ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mt-16" />
        ) : events.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <CalendarHeart className="w-10 h-10 mx-auto text-primary mb-2" />
            <p className="font-semibold text-gray-900 dark:text-white">Nothing shared yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">When your event planner shares an event with your email address, it shows up here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/my-events/${e.id}`} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition">
                  <span className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><CalendarHeart className="w-6 h-6" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-900 dark:text-white">{e.name}</span>
                    <span className="block text-sm text-gray-500 dark:text-gray-400">{[e.date ? dayjs(e.date).format("ddd D MMM YYYY") : "Date to be confirmed", e.venue].filter(Boolean).join(" · ")}</span>
                    <span className="block text-xs text-gray-400">Planned by {e.event_planner.name}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
