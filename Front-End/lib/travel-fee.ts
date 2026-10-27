/**
 * Delivery / travel fee by distance (the server's rules are in Back-end/src/modules/booking/travel-fee.ts).
 * The apps only use this for the package form's worked example; a booking's fee always comes from the server.
 */

export const MAX_FREE_MILES = 250;
export const MAX_PER_MILE = 50;
export const MAX_BASE_FEE = 1000;

export interface TravelTerms {
  free_miles: number;
  per_mile: number;
  base_fee: number;
  round_trip: boolean;
}

/** A travel fee worked out on the server (a booking preview, the live quote, a booking). */
export interface TravelQuote {
  status: "PRICED" | "UNPRICED" | "VENDOR";
  terms: TravelTerms;
  one_way_miles: number | null;
  miles: number | null;
  chargeable_miles: number | null;
  fee: number | null;
  label: string;
  outside_area: boolean;
  message?: string | null;
  /** the address changed after payments started: the fee for the new one (the difference was settled on its own) */
  now?: { fee: number; label: string; miles: number | null } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/** The fee for a road distance (one way), as the server works it out. */
export function feeForMiles(t: TravelTerms, oneWayMiles: number) {
  const oneWay = round1(Math.max(0, oneWayMiles));
  const miles = t.round_trip ? round1(oneWay * 2) : oneWay;
  const chargeable = round1(Math.max(0, miles - t.free_miles));
  return { miles, chargeable, fee: round2(t.base_fee + chargeable * t.per_mile) };
}

/** "A customer 25 miles away pays $30.00 (50 miles there and back, 15 free, then $2.00 a mile)." */
export function travelExample(t: TravelTerms, milesAway = 25): string {
  const f = feeForMiles(t, milesAway);
  const counted = t.round_trip ? `${f.miles} miles there and back` : `${f.miles} miles`;
  const parts = [counted];
  if (t.free_miles > 0) parts.push(`${t.free_miles} free`);
  if (t.per_mile > 0 && f.chargeable > 0) parts.push(`then ${money(t.per_mile)} a mile`);
  if (t.base_fee > 0) parts.push(`plus ${money(t.base_fee)}`);
  return `A customer ${milesAway} miles away pays ${money(f.fee)} (${parts.join(", ")}).`;
}

/**
 * Whether the package form offers a travel fee: only when the vendor goes to the customer, and not for
 * venues (customers come to those). Same rule as the server's booking-place.ts.
 */
export function offersTravelFee(serviceAt: string, categoryName?: string | null): boolean {
  return serviceAt !== "VENDOR_LOCATION" && categoryName?.trim().toLowerCase() !== "venues";
}

/** "About 30.0 miles away (one way)": the distance line under the address. */
export function distanceText(q: Pick<TravelQuote, "one_way_miles" | "miles" | "terms">): string | null {
  if (q.one_way_miles == null) return null;
  return q.terms.round_trip
    ? `About ${q.one_way_miles.toFixed(1)} miles away (${(q.miles ?? 0).toFixed(1)} miles there and back)`
    : `About ${q.one_way_miles.toFixed(1)} miles away`;
}
