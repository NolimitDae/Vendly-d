import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";
import type { ServiceAt } from "@/lib/booking-tracker";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

/** What a "Needs your attention" row is about (Back-end/src/modules/vendor/dashboard/dashboard-attention.ts). */
export type AttentionKind =
  | "request"
  | "changes_approved"
  | "changes_declined"
  | "payment"
  | "dispute"
  | "rental_return"
  | "extra_waiting"
  | "unread_chats";

export interface AttentionItem {
  kind: AttentionKind;
  booking_id: string | null;
  title: string | null;
  customer_name: string | null;
  /** request: when it closes; payment: pay-by time; rental: when it was due back; dispute: opened; add-on or fee: sent */
  at: string | null;
  /** payment: deposit | balance | the charge's label; add-on or fee: its name; complaint: its category */
  detail?: string | null;
  amount?: number | null;
  /** complaint: you already replied; payment: being tried again */
  done?: boolean;
  chats?: number;
  messages?: number;
}

/** A next booking, with what the "On the day" buttons need. */
export interface UpcomingBooking {
  id: string;
  status: string;
  title: string | null;
  amount: number | null;
  scheduled_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  venue_address: string | null;
  listing: { id: string; title: string; service_at?: ServiceAt } | null;
  customer: { id: string; name: string | null; avatar_url: string | null } | null;
  is_rental: boolean;
  service_at: ServiceAt;
  steps_open: boolean;
  payment_state: "pending_deposit" | "pending_balance" | null;
  confirmed_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  checked_in_at?: string | null;
  started_at?: string | null;
}

export interface DashboardHome {
  attention: AttentionItem[];
  upcoming: UpcomingBooking[];
}

export const VendorDashboardService = {
  /** Vendors: what needs your attention and your next bookings. */
  home: async () => Fetch.get("/vendor/dashboard", authHeaders()),
};
