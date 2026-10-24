"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { FileText, Loader2 } from "lucide-react";
import ModalWrapper from "../common/modal/ModalWrapper";
import { AdminService } from "@/service/admin/admin.service";
import { EVENT_TYPE_LABELS, PlannerStatus, PlannerStatusBadge } from "./tableConfig";

export interface PlannerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  avatar: string | null;
  created_at: string;
  status: number;
  id_verified: boolean;
  planner_status: PlannerStatus;
  profile: {
    business_name: string | null;
    bio: string | null;
    website: string | null;
    instagram: string | null;
    event_types: string[];
    years_experience: number | null;
    team_size: number | null;
    license_status: string;
    approved_at: string | null;
    portfolio: string[];
    /** short-lived signed links to the licence files */
    documents: string[];
  } | null;
  events: { total: number; by_status: Record<string, number> };
  bookings: {
    total: number;
    recent: { id: string; status: string; amount: number | null; created_at: string; date: string | null; title: string | null; vendor: string | null }[];
  };
  history: { at: string; event: "joined" | "applied" | "approved" | "suspended" | "restored"; note: string | null; by: string | null }[];
}

const HISTORY_LABELS: Record<string, string> = {
  joined: "Joined Vendly",
  applied: "Sent planner profile",
  approved: "Licence approved",
  suspended: "Account suspended",
  restored: "Account reactivated",
};

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "-");
const words = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-sm font-semibold text-blackColor">{title}</h3>
    {children}
  </section>
);

interface Props {
  userId: string;
  /** bump to load again (after a suspend or reactivate) */
  refreshKey?: number;
  onClose: () => void;
  onToggleStatus: (planner: PlannerDetail) => void;
}

/** One planner for admins: profile, licence documents, events, bookings and what happened to the account. */
export default function PlannerDetails({ userId, refreshKey = 0, onClose, onToggleStatus }: Props) {
  const [planner, setPlanner] = useState<PlannerDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setError(false);
    AdminService.getPlanner(userId)
      .then((res) => live && setPlanner(res.data?.data ?? null))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [userId, refreshKey]);

  const p = planner?.profile;
  const suspended = planner?.status === 0;

  return (
    <ModalWrapper isOpen onClose={onClose} size="xl">
      <div role="dialog" aria-modal="true" aria-label="Planner details" className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
        {error ? (
          <p className="text-sm text-red-600 py-10 text-center">Couldn&apos;t load this planner. Close and try again.</p>
        ) : !planner ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pr-10">
              <Image src={planner.avatar || "/no-image.jpg"} alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover" unoptimized />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-blackColor">{p?.business_name || planner.name || planner.email}</h2>
                  <PlannerStatusBadge status={planner.planner_status} />
                </div>
                <p className="text-sm text-descriptionColor">
                  {[planner.name, planner.email, planner.phone, planner.location].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-descriptionColor">
                  Joined {date(planner.created_at)} · {planner.id_verified ? "ID verified" : "ID not verified"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggleStatus(planner)}
                className={`self-start px-4 py-2 rounded-full text-sm font-semibold ${suspended ? "bg-primary text-primary-foreground" : "border border-red-300 text-red-600"}`}
              >
                {suspended ? "Reactivate" : "Suspend"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Events", value: planner.events.total },
                { label: "Bookings", value: planner.bookings.total },
                { label: "Experience", value: p?.years_experience != null ? `${p.years_experience} yrs` : "-" },
                { label: "Team", value: p?.team_size ?? "-" },
              ].map((s) => (
                <div key={s.label} className="bg-grayBg rounded-xl p-3">
                  <p className="text-xs text-descriptionColor">{s.label}</p>
                  <p className="text-lg font-semibold text-blackColor">{s.value}</p>
                </div>
              ))}
            </div>

            <Section title="Profile">
              {p ? (
                <div className="space-y-2 text-sm text-blackColor">
                  {p.bio && <p className="leading-[160%] whitespace-pre-line">{p.bio}</p>}
                  <p className="text-descriptionColor">
                    Event types: {p.event_types.length ? p.event_types.map((t) => EVENT_TYPE_LABELS[t] ?? t).join(", ") : "-"}
                  </p>
                  {(p.website || p.instagram) && (
                    <p className="text-descriptionColor break-all">{[p.website, p.instagram].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-descriptionColor">They haven&apos;t filled in their planner profile yet.</p>
              )}
            </Section>

            <Section title="Documents">
              {p?.documents.length ? (
                <ul className="flex flex-wrap gap-2">
                  {p.documents.map((url, i) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-borderColor text-sm text-primary">
                        <FileText className="w-4 h-4" /> Document {i + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-descriptionColor">No documents sent.</p>
              )}
            </Section>

            {Object.keys(planner.events.by_status).length > 0 && (
              <Section title="Events">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(planner.events.by_status).map(([s, n]) => (
                    <span key={s} className="px-3 py-1 rounded-full bg-grayBg text-xs text-blackColor">{words(s)}: {n}</span>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Recent bookings">
              {planner.bookings.recent.length ? (
                <ul className="divide-y divide-borderColor text-sm">
                  {planner.bookings.recent.map((b) => (
                    <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2">
                      <span className="text-blackColor">
                        {b.title || "Booking"}{b.vendor ? ` with ${b.vendor}` : ""}
                        <span className="block text-xs text-descriptionColor">{date(b.date ?? b.created_at)} · {words(b.status)}</span>
                      </span>
                      <span className="text-blackColor font-medium">{b.amount != null ? `$${b.amount.toFixed(2)}` : "-"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-descriptionColor">No bookings yet.</p>
              )}
            </Section>

            <Section title="History">
              <ol className="space-y-2 text-sm">
                {planner.history.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-xs text-descriptionColor w-20 shrink-0 pt-0.5">{date(h.at)}</span>
                    <span className="text-blackColor">
                      {HISTORY_LABELS[h.event] ?? h.event}
                      {h.by && <span className="text-descriptionColor"> by {h.by}</span>}
                      {h.note && <span className="block text-xs text-descriptionColor">{h.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}
