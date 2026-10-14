import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = (multipart = false) => ({
  headers: {
    "Content-Type": multipart ? "multipart/form-data" : "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export type EventRole = "planner" | "vendor" | "client";

export interface TimelineItem {
  id: string;
  starts_at: string;
  ends_at?: string | null;
  title: string;
  notes?: string | null;
  location?: string | null;
  vendor_id?: string | null;
  vendor?: { id: string; name: string } | null;
  done: boolean;
}

export interface EventFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  created_at: string;
  uploader: { id: string; name: string };
  can_delete: boolean;
  url: string;
}

export interface EventOverview {
  id: string;
  name: string;
  date?: string | null;
  venue?: string | null;
  role: EventRole;
  planner: { id: string; name: string } | null;
  client_sees_budget: boolean;
  vendors: { booking_id: string; status: string; vendor: { id: string; name: string }; service: string; starts_at?: string | null; total?: number }[];
  timeline: TimelineItem[];
  file_count: number;
}

export interface BudgetSummary {
  total_budget: number | null;
  allocated: number;
  committed: number;
  spent: number;
  remaining: number | null;
  over_budget: boolean;
  can_edit: boolean;
  lines: { id: string; category: string; allocated: number; spent: number; committed: number; note: string | null; booking: { id: string; status: string; vendor_name: string; title: string } | null }[];
  unassigned_bookings: { id: string; vendor_name: string; title: string; total: number; paid: number; status: string }[];
}

export interface VendorTeam {
  id: string;
  name: string;
  vendor_ids: string[];
  vendors: { id: string; name: string }[];
}

export const EventToolsService = {
  overview: (eventId: string) => Fetch.get(`/events/${eventId}/overview`, authHeaders()),
  shared: () => Fetch.get("/client/events", authHeaders()),
  setClient: (eventId: string, body: { email?: string | null; sees_budget?: boolean }) => Fetch.patch(`/events/${eventId}/client`, body, authHeaders()),

  timeline: (eventId: string) => Fetch.get(`/events/${eventId}/timeline`, authHeaders()),
  addTimeline: (eventId: string, body: { starts_at: string; ends_at?: string; title: string; notes?: string; location?: string; vendor_id?: string }) =>
    Fetch.post(`/events/${eventId}/timeline`, body, authHeaders()),
  updateTimeline: (eventId: string, itemId: string, body: Partial<TimelineItem>) => Fetch.patch(`/events/${eventId}/timeline/${itemId}`, body, authHeaders()),
  deleteTimeline: (eventId: string, itemId: string) => Fetch.delete(`/events/${eventId}/timeline/${itemId}`, authHeaders()),

  files: (eventId: string) => Fetch.get(`/events/${eventId}/files`, authHeaders()),
  upload: (eventId: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return Fetch.post(`/events/${eventId}/files`, fd, authHeaders(true));
  },
  deleteFile: (eventId: string, fileId: string) => Fetch.delete(`/events/${eventId}/files/${fileId}`, authHeaders()),

  budget: (eventId: string) => Fetch.get(`/events/${eventId}/budget-summary`, authHeaders()),

  teams: () => Fetch.get("/vendor-teams", authHeaders()),
  saveTeam: (body: { name: string; vendor_ids: string[] }, id?: string) => (id ? Fetch.patch(`/vendor-teams/${id}`, body, authHeaders()) : Fetch.post("/vendor-teams", body, authHeaders())),
  deleteTeam: (id: string) => Fetch.delete(`/vendor-teams/${id}`, authHeaders()),
  inviteTeam: (eventId: string, teamId: string, note?: string) => Fetch.post(`/events/${eventId}/invite-team`, { team_id: teamId, note }, authHeaders()),
};

export const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
/** $1,200 for whole dollars, $1,207.50 otherwise */
export const usd = (n: number | null | undefined) => {
  if (n == null) return "—";
  const cents = Number(n) % 1 !== 0;
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
};
