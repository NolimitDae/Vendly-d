import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const json = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export type AddOnKind = "ADD_ON" | "FEE";
export type AddOnUnit = "FIXED" | "PER_PERSON" | "PER_HOUR" | "PER_ITEM";

/** A vendor's add-on or fee as it appears on a package or in their library. */
export interface AddOn {
  id: string;
  kind: AddOnKind;
  name: string;
  description: string | null;
  price: number;
  price_unit: AddOnUnit;
  /** e.g. "$50.00 per hour" */
  price_text: string;
  max_quantity: number | null;
  in_library: boolean;
  /** packages it's on (library listings only) */
  listing_ids?: string[];
}

export interface AddOnSuggestion {
  name: string;
  price_unit: AddOnUnit;
  description?: string;
}

export interface AddOnInput {
  kind?: AddOnKind;
  name: string;
  description?: string;
  price: number;
  price_unit?: AddOnUnit;
  max_quantity?: number | null;
  in_library?: boolean;
  listing_ids?: string[];
}

export type ExtraStatus = "INCLUDED" | "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED" | "IN_REVIEW" | "WAIVED";

/** An add-on or fee on a booking: picked when booking (INCLUDED) or sent by the vendor afterwards. */
export interface Extra {
  id: string;
  kind: AddOnKind;
  name: string;
  description: string | null;
  /** e.g. "Bartender: $40.00 × 5 hours" */
  label: string;
  unit_price: number;
  price_unit: AddOnUnit;
  quantity: number;
  amount: number;
  /** Vendly Protection fee (add-ons sent after booking only) */
  fee_amount: number;
  total: number;
  note: string | null;
  /** add-ons only: minutes it adds to the booking (moves the end time once approved) */
  extends_minutes?: number | null;
  /** "Adds 2 hours" */
  extends_label?: string | null;
  status: ExtraStatus;
  created_at: string;
  responded_at: string | null;
  decline_reason: string | null;
  review_requested_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  /** fees still PENDING: when "Ask Vendly to review" unlocks */
  can_escalate_at: string | null;
  payment: {
    installment_id: string;
    status: "SCHEDULED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
    paid_at: string | null;
    last_error: string | null;
    refunded_amount: number;
  } | null;
}

export interface ExtrasMeta {
  /** the booking's times now (an approved add-on that adds time moves the end) */
  event_start_at?: string | null;
  event_end_at?: string | null;
  waiting_on_customer: number;
  waiting_total: number;
  can_request: { add_on: boolean; fee: boolean };
}

export interface ExtraRequestInput {
  kind: AddOnKind;
  add_on_id?: string;
  name?: string;
  unit_price?: number;
  price_unit?: AddOnUnit;
  quantity?: number;
  note?: string;
  /** add-ons only: minutes added to the booking when approved */
  extends_minutes?: number;
}

export interface GiveBackResult {
  amount: number;
  lowered: number;
  refunded: number;
  recovered_from_balance: number;
}

export type AdminExtra = Extra & {
  booking: {
    id: string;
    status: string;
    completed_at: string | null;
    amount: number | null;
    currency: string | null;
    listing: { title: string } | null;
    customer: { id: string; name: string; email: string };
    vendor: { id: string; name: string; email: string };
    has_proof: boolean;
  };
};

/** Picks sent with a booking preview and the booking request (they must match). */
export interface AddOnPick {
  add_on_id: string;
  quantity?: number;
}

export const AddOnsService = {
  // vendor library
  list: (params: { kind?: AddOnKind; listing_id?: string } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    return Fetch.get(`/vendor/add-ons?${q.toString()}`, json());
  },
  suggestions: (kind: AddOnKind) => Fetch.get(`/vendor/add-ons/suggestions?kind=${kind}`, json()),
  create: (data: AddOnInput) => Fetch.post("/vendor/add-ons", data, json()),
  update: (id: string, data: Partial<AddOnInput>) => Fetch.patch(`/vendor/add-ons/${id}`, data, json()),
  remove: (id: string) => Fetch.delete(`/vendor/add-ons/${id}`, json()),
  attach: (add_on_ids: string[], listing_ids: string[], mode: "add" | "remove" = "add") =>
    Fetch.post("/vendor/add-ons/attach", { add_on_ids, listing_ids, mode }, json()),
  forListing: (listingId: string) => Fetch.get(`/vendor/add-ons/listing/${listingId}`, json()),
  /** Replaces the package's full set of add-ons and fees; order is display order. */
  setForListing: (listingId: string, add_on_ids: string[]) =>
    Fetch.put(`/vendor/add-ons/listing/${listingId}`, { add_on_ids }, json()),
};

export const BookingExtrasService = {
  list: (bookingId: string) => Fetch.get(`/bookings/${bookingId}/extras`, json()),
  // vendor
  request: (bookingId: string, data: ExtraRequestInput) => Fetch.post(`/bookings/${bookingId}/extras`, data, json()),
  withdraw: (extraId: string) => Fetch.post(`/booking-extras/${extraId}/withdraw`, {}, json()),
  escalate: (extraId: string, note: string) => Fetch.post(`/booking-extras/${extraId}/escalate`, { note }, json()),
  giveBack: (bookingId: string, amount: number, reason: string) =>
    Fetch.post(`/bookings/${bookingId}/give-back`, { amount, reason }, json()),
  // customer
  approve: (extraId: string, paymentMethodId?: string) =>
    Fetch.post(`/booking-extras/${extraId}/approve`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}, json()),
  decline: (extraId: string, reason?: string) =>
    Fetch.post(`/booking-extras/${extraId}/decline`, reason ? { reason } : {}, json()),
  // admin
  adminList: (status: "open" | "done") => Fetch.get(`/admin/booking-extras?status=${status}`, json()),
  adminReview: (extraId: string, action: "charge" | "waive", note: string) =>
    Fetch.post(`/admin/booking-extras/${extraId}/review`, { action, note }, json()),
};
