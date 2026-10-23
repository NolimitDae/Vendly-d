import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export type PlanPriority = "ESSENTIAL" | "RECOMMENDED" | "NICE_TO_HAVE";

/** What "Find vendors" turns into a marketplace search. */
export interface PlanSearch {
  category_id: string;
  /** yyyy-MM-dd */
  date: string | null;
  near_lat: number | null;
  near_lng: number | null;
  radius_miles: number | null;
  location: string | null;
}

export interface PlanItem {
  category: { id: string; name: string };
  priority: PlanPriority;
  why: string;
  tip: string | null;
  lead_days: number;
  /** yyyy-MM-dd */
  book_by: string | null;
  book_soon: boolean;
  share_percent: number;
  suggested_budget: number | null;
  available_vendors: number;
  search: PlanSearch;
  /** event plans only */
  covered?: boolean;
  covered_by?: "booking" | "budget" | "venue" | null;
}

export interface Plan {
  event_type: string;
  guest_count: number | null;
  budget: number | null;
  date: string | null;
  near: { lat: number; lng: number; label: string | null } | null;
  location: string | null;
  radius_miles: number;
  items: PlanItem[];
  totals: { suggested_budget: number | null };
  /** event plans only */
  event?: { id: string; name: string; status: string; type_set: boolean };
  summary?: { total: number; covered: number };
}

export interface ChecklistRequest {
  event_type: string;
  guest_count?: number;
  budget?: number;
  /** yyyy-MM-dd */
  date?: string;
  location?: string;
  lat?: number;
  lng?: number;
}

/** "Plan your event": suggested services, budget split and vendors available. */
export const PlanningService = {
  checklist: async (body: ChecklistRequest) => Fetch.post("/planning/checklist", body),
  eventPlan: async (eventId: string) => Fetch.get(`/events/${eventId}/plan`, authHeaders()),
};
