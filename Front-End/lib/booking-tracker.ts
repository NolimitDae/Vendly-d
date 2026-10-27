/** The "Upcoming booking" tracker: steps, phone links, directions and the map tiles around a place. */

export type ServiceAt = "CUSTOMER_LOCATION" | "VENDOR_LOCATION";

/** What the booking detail endpoint adds for the tracker (see the API's booking-tracker.ts). */
export interface TrackerFields {
  status: string;
  is_rental?: boolean;
  /** the customer chose to come to the vendor (or pick up a rental) */
  customer_comes?: boolean;
  service_at?: ServiceAt;
  confirmed_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  checked_in_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  venue_address?: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  /** once accepted (and for 3 days after it's done): the other side's number */
  contact_revealed?: boolean;
  contact_phone?: string | null;
  /** customers, packages at the vendor's place, once accepted: where to go */
  vendor_place?: { address: string; lat: number | null; lng: number | null } | null;
  /** vendors: the day-of steps are open today */
  steps_open?: boolean;
  listing?: { location?: string | null; service_at?: ServiceAt } | null;
}

export interface TrackerStep {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
}

/**
 * Confirmed → On the way → Arrived → In progress → Done (at the vendor's place: Confirmed → Checked in →
 * In progress → Done). A step counts as done once it has a time, or once a later step (or the booking's
 * status) is past it, even if the vendor skipped it.
 */
export function trackerSteps(b: TrackerFields): TrackerStep[] {
  const raw =
    b.service_at === "VENDOR_LOCATION"
      ? [
          { key: "confirmed", label: "Confirmed", at: b.confirmed_at },
          { key: "checked_in", label: "Checked in", at: b.checked_in_at },
          { key: "started", label: "In progress", at: b.started_at },
          { key: "done", label: "Done", at: b.completed_at },
        ]
      : [
          { key: "confirmed", label: "Confirmed", at: b.confirmed_at },
          { key: "en_route", label: "On the way", at: b.en_route_at },
          { key: "arrived", label: "Arrived", at: b.arrived_at },
          { key: "started", label: "In progress", at: b.started_at },
          { key: "done", label: "Done", at: b.completed_at },
        ];
  // the status is the authority: an accepted booking is at least confirmed, a started one at least in progress
  const floor = b.status === "COMPLETED" ? raw.length - 1 : b.status === "IN_PROGRESS" ? raw.length - 2 : 0;
  let last = -1;
  raw.forEach((s, i) => {
    if (s.at || i <= floor) last = i;
  });
  return raw.map((s, i) => ({ key: s.key, label: s.label, at: s.at ?? null, done: i <= last }));
}

/** The tracker shows once a booking is accepted, and stays after it's done. */
export const showsTracker = (b: TrackerFields) => ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(b.status) && !b.is_rental;

/**
 * The vendor's next day-of step, if it's that day (or the day before) and one is left. Once the booking
 * is started only the arrival is left (it comes before Mark as completed), so On my way is skipped.
 */
export function nextVendorStep(b: TrackerFields): { path: "en-route" | "arrived" | "check-in"; label: string } | null {
  if (!["CONFIRMED", "IN_PROGRESS"].includes(b.status) || !b.steps_open || b.is_rental) return null;
  if (b.service_at === "VENDOR_LOCATION") return b.checked_in_at ? null : { path: "check-in", label: "Customer arrived" };
  if (b.arrived_at) return null;
  return b.en_route_at || b.status === "IN_PROGRESS" ? { path: "arrived", label: "Arrived" } : { path: "en-route", label: "On my way" };
}

/** A tel: link for a phone number as typed (keeps the + and the digits). */
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Google Maps directions to a place: its map position when known, else the address. */
export function directionsUrl(place: { lat?: number | null; lng?: number | null; address?: string | null }) {
  const dest = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : (place.address ?? "").trim();
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
}

/** Loose check, as the API does: digits, spaces, +, - and brackets, 7 to 20 digits. Empty is fine. */
export function phoneProblem(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  if (!/^[\d\s+\-().]+$/.test(t)) return "Use only digits, spaces, +, - and brackets in your phone number.";
  const digits = t.replace(/\D/g, "").length;
  return digits < 7 || digits > 20 ? "Enter a phone number with 7 to 20 digits." : null;
}

// ─── Map tiles ────────────────────────────────────────────────────────────

export const TILE_SIZE = 256;

/** Position in tile units at a zoom (Web Mercator, as every slippy map uses). */
export function toTile(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** The tiles (served by the API's cached proxy) that cover a width × height box centred on the point. */
export function tilesAround(lat: number, lng: number, width: number, height: number, z = 15) {
  const n = 2 ** z;
  const c = toTile(lat, lng, z);
  const left = c.x * TILE_SIZE - width / 2;
  const top = c.y * TILE_SIZE - height / 2;
  const out: { key: string; url: string; left: number; top: number }[] = [];
  for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor((top + height) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor((left + width) / TILE_SIZE); tx++) {
      const x = ((tx % n) + n) % n; // across the date line
      out.push({ key: `${tx}/${ty}`, url: `/api/geo/tile/${z}/${x}/${ty}`, left: tx * TILE_SIZE - left, top: ty * TILE_SIZE - top });
    }
  }
  return out;
}
