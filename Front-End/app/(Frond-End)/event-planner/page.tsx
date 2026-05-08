"use client";

import { useEffect, useState } from "react";
import { EventPlannerService } from "@/service/event-planner/event-planner.service";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Users, Calendar } from "lucide-react";

const EVENT_TYPES = [
  "WEDDING",
  "BIRTHDAY",
  "CORPORATE",
  "CONCERT",
  "CONFERENCE",
  "PRIVATE_PARTY",
  "OTHER",
];

interface Planner {
  id: string;
  business_name?: string;
  bio?: string;
  event_types?: string[];
  years_experience?: number;
  team_size?: number;
  portfolio?: string[];
  user?: { id: string; name: string; avatar_url?: string };
}

export default function EventPlannerPage() {
  const [planners, setPlanners] = useState<Planner[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });

  useEffect(() => {
    setLoading(true);
    EventPlannerService.listPlanners({ page, event_type: eventType || undefined })
      .then((res) => {
        if (res.data?.success) {
          setPlanners(res.data.data);
          setMeta(res.data.meta);
        }
      })
      .finally(() => setLoading(false));
  }, [page, eventType]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Event Planners</h1>
          <p className="text-gray-500 mt-1">Find the perfect event planner for your occasion</p>
        </div>

        {/* Event type filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => { setEventType(""); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              !eventType ? "bg-primary text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
            }`}
          >
            All Events
          </button>
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => { setEventType(type); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                eventType === type
                  ? "bg-primary text-white"
                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
              }`}
            >
              {type.replace("_", " ")}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-4">{meta.total} planners found</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : planners.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>No event planners found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {planners.map((planner) => (
              <PlannerCard key={planner.id} planner={planner} />
            ))}
          </div>
        )}

        {meta.last_page > 1 && (
          <div className="flex justify-center gap-2 mt-10">
            {Array.from({ length: meta.last_page }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition ${
                  page === i + 1
                    ? "bg-primary text-white"
                    : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlannerCard({ planner }: { planner: Planner }) {
  const cover = planner.portfolio?.[0];

  return (
    <Link href={`/event-planner/${planner.user?.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 dark:border-gray-700 group cursor-pointer">
        {/* Portfolio cover */}
        <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
          {cover ? (
            <Image src={cover} alt="" fill className="object-cover group-hover:scale-105 transition duration-300" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-20">🎉</div>
          )}
        </div>

        <div className="p-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 -mt-8 mb-3">
            {planner.user?.avatar_url ? (
              <Image
                src={planner.user.avatar_url}
                alt={planner.user.name}
                width={56}
                height={56}
                className="rounded-full object-cover border-4 border-white dark:border-gray-800 shadow"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl border-4 border-white dark:border-gray-800 shadow">
                {planner.user?.name?.[0]?.toUpperCase() ?? "P"}
              </div>
            )}
          </div>

          <h3 className="font-semibold text-gray-900 dark:text-white">
            {planner.business_name || planner.user?.name}
          </h3>

          {planner.bio && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{planner.bio}</p>
          )}

          <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
            {planner.years_experience !== undefined && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {planner.years_experience} yrs exp.
              </span>
            )}
            {planner.team_size && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                Team of {planner.team_size}
              </span>
            )}
          </div>

          {planner.event_types?.length && (
            <div className="flex flex-wrap gap-1 mt-3">
              {planner.event_types.slice(0, 3).map((type) => (
                <span key={type} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {type.replace("_", " ")}
                </span>
              ))}
              {planner.event_types.length > 3 && (
                <span className="text-xs text-gray-400">+{planner.event_types.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
