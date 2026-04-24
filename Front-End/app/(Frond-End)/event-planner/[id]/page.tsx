"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EventPlannerService } from "@/service/event-planner/event-planner.service";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Users,
  Briefcase,
  Phone,
  Globe,
  Loader2,
  CheckCircle,
} from "lucide-react";

interface PlannerDetail {
  id: string;
  business_name?: string;
  bio?: string;
  event_types?: string[];
  years_experience?: number;
  team_size?: number;
  portfolio?: string[];
  license_status?: string;
  user?: {
    id: string;
    name: string;
    avatar?: string;
    phone?: string;
  };
  vendorProfile?: {
    website?: string;
    about_me?: string;
  };
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  WEDDING: "Wedding",
  BIRTHDAY: "Birthday",
  CORPORATE: "Corporate",
  CONCERT: "Concert",
  CONFERENCE: "Conference",
  PRIVATE_PARTY: "Private Party",
  OTHER: "Other",
};

export default function EventPlannerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [planner, setPlanner] = useState<PlannerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    EventPlannerService.getProfile(id)
      .then((res) => {
        if (res.data?.success) {
          setPlanner(res.data.data);
        } else {
          router.push("/event-planner");
        }
      })
      .catch(() => router.push("/event-planner"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!planner) return null;

  const displayName = planner.business_name || planner.user?.name || "Planner";
  const initials = displayName?.[0]?.toUpperCase() ?? "P";
  const portfolio = planner.portfolio ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/event-planner"
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white mb-6 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Event Planners
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Profile card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm text-center">
              {planner.user?.avatar ? (
                <Image
                  src={planner.user.avatar}
                  alt={displayName}
                  width={96}
                  height={96}
                  className="rounded-full object-cover mx-auto border-4 border-primary/20"
                  unoptimized
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-white font-bold text-3xl mx-auto">
                  {initials}
                </div>
              )}

              <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-4">{displayName}</h1>
              {planner.business_name && planner.user?.name && planner.business_name !== planner.user.name && (
                <p className="text-sm text-gray-400 mt-0.5">{planner.user.name}</p>
              )}

              {planner.license_status === "APPROVED" && (
                <div className="flex items-center justify-center gap-1.5 mt-2 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Verified Planner</span>
                </div>
              )}
            </div>

            {/* Stats card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
              {planner.years_experience !== undefined && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Briefcase className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm">{planner.years_experience} years of experience</span>
                </div>
              )}
              {planner.team_size && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Users className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm">Team of {planner.team_size}</span>
                </div>
              )}
              {planner.user?.phone && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm">{planner.user.phone}</span>
                </div>
              )}
              {planner.vendorProfile?.website && (
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                  <a
                    href={planner.vendorProfile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                  >
                    {planner.vendorProfile.website}
                  </a>
                </div>
              )}
            </div>

            {/* Event types */}
            {planner.event_types?.length ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Event Types
                </h3>
                <div className="flex flex-wrap gap-2">
                  {planner.event_types.map((type) => (
                    <span
                      key={type}
                      className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium"
                    >
                      {EVENT_TYPE_LABELS[type] ?? type}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio */}
            {planner.bio && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-3">About</h2>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {planner.bio}
                </p>
              </div>
            )}

            {/* Portfolio */}
            {portfolio.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Portfolio</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {portfolio.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group"
                    >
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-cover group-hover:scale-105 transition duration-300"
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!planner.bio && portfolio.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 shadow-sm text-center text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No additional details provided yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-w-3xl w-full max-h-[80vh] aspect-video" onClick={(e) => e.stopPropagation()}>
            <Image
              src={portfolio[lightboxIdx]}
              alt=""
              fill
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="absolute top-4 right-4 flex gap-3">
            {lightboxIdx > 0 && (
              <button
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm"
                onClick={() => setLightboxIdx((i) => (i ?? 1) - 1)}
              >
                ← Prev
              </button>
            )}
            {lightboxIdx < portfolio.length - 1 && (
              <button
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm"
                onClick={() => setLightboxIdx((i) => (i ?? 0) + 1)}
              >
                Next →
              </button>
            )}
            <button
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm"
              onClick={() => setLightboxIdx(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
