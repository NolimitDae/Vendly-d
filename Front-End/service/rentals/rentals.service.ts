import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = (multipart = false) => ({
  headers: {
    "Content-Type": multipart ? "multipart/form-data" : "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export type RentalItemStatus = "DRAFT" | "ACTIVE" | "PAUSED";

export interface RentalItem {
  id: string;
  vendor_id: string;
  title: string;
  description: string;
  images: string[];
  image_keys?: string[];
  category_id?: string | null;
  daily_rate: number;
  deposit_amount: number;
  quantity: number;
  turnaround_hours: number;
  /** how the customer gets it: the vendor delivers it, and/or they pick it up (missing on older data: both) */
  offers_delivery?: boolean;
  offers_pickup?: boolean;
  location?: string | null;
  status: RentalItemStatus;
  /** the vendor's instructions for using the equipment */
  dos?: string[] | null;
  donts?: string[] | null;
  vendor?: { id: string; name: string; avatar_url?: string | null };
  available?: number;
  available_today?: number;
  calendar?: { date: string; available: number }[];
}

export interface RentalReservation {
  id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  status: "ACTIVE" | "RETURNED" | "CANCELLED";
  booking: { id: string; status: string; customer?: { id: string; name: string } };
}

export interface RentalLine {
  item_id: string;
  quantity: number;
}

export interface RentalQuote {
  days: number;
  subtotal: number;
  service_fee: number;
  security_deposit: number;
  due_on_accept: number;
  available: boolean;
  /** what every item in the order offers */
  handover?: { delivery: boolean; pickup: boolean };
  lines: { item_id: string; title: string; quantity: number; available: number; ok: boolean; daily_rate: number; deposit_amount: number }[];
}

const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && q.set(k, String(v)));
  return q.toString();
};

export const RentalsService = {
  browse: (params: { search?: string; vendor_id?: string; start_date?: string; end_date?: string; page?: number; limit?: number }) =>
    Fetch.get(`/rentals?${qs(params)}`),
  item: (id: string) => Fetch.get(`/rentals/${id}`),
  quote: (body: { lines: RentalLine[]; start_date: string; end_date: string }) => Fetch.post("/rentals/quote", body),
  book: (body: { lines: RentalLine[]; start_date: string; end_date: string; venue_address?: string; customer_comes?: boolean; message?: string; payment_method_id: string }) =>
    Fetch.post("/rentals/book", body, authHeaders()),

  mine: () => Fetch.get("/vendor/rentals", authHeaders()),
  mineOne: (id: string) => Fetch.get(`/vendor/rentals/${id}`, authHeaders()),
  save: (form: FormData, id?: string) => (id ? Fetch.patch(`/vendor/rentals/${id}`, form, authHeaders(true)) : Fetch.post("/vendor/rentals", form, authHeaders(true))),
  setStatus: (id: string, status: RentalItemStatus) => {
    const fd = new FormData();
    fd.append("status", status);
    return Fetch.patch(`/vendor/rentals/${id}`, fd, authHeaders(true));
  },
  remove: (id: string) => Fetch.delete(`/vendor/rentals/${id}`, authHeaders()),
  recordReturn: (bookingId: string, body: { notes?: string; damage_fee?: number; late_fee?: number; photos?: File[] }) => {
    const fd = new FormData();
    if (body.notes) fd.append("notes", body.notes);
    if (body.damage_fee) fd.append("damage_fee", String(body.damage_fee));
    if (body.late_fee) fd.append("late_fee", String(body.late_fee));
    (body.photos ?? []).forEach((f) => fd.append("photos", f));
    return Fetch.post(`/rentals/bookings/${bookingId}/return`, fd, authHeaders(true));
  },
};

/** yyyy-MM-dd for a local date: the backend treats it as a whole rental day. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const money = (n: number | string | null | undefined) => "$" + Number(n ?? 0).toFixed(2);

/** Message from an axios error, else a fallback. */
export const errorMessage = (e: unknown, fallback = "Something went wrong") => {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(" ") : m || fallback;
};
