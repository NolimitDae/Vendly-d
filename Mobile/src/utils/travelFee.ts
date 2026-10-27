/**
 * Delivery / travel fee by distance (the server's rules are in Back-end/src/modules/booking/travel-fee.ts).
 * The app only works one out for the package form's example; a booking's fee always comes from the server.
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
  status: 'PRICED' | 'UNPRICED' | 'VENDOR';
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

/** The package form's travel fee, as typed. */
export interface TravelFeeValue {
  enabled: boolean;
  freeMiles: string;
  perMile: string;
  baseFee: string;
  roundTrip: boolean;
}

export const emptyTravelFee = (): TravelFeeValue => ({ enabled: false, freeMiles: '', perMile: '', baseFee: '', roundTrip: false });

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
const cents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Form values from a saved package. */
export function travelFeeFrom(l: { travel_fee_enabled?: boolean | null; travel_free_miles?: number | null; travel_per_mile?: number | string | null; travel_base_fee?: number | string | null; travel_round_trip?: boolean | null }): TravelFeeValue {
  const text = (v: number | string | null | undefined) => (v == null || v === '' || Number(v) === 0 ? '' : String(Number(v)));
  return { enabled: !!l.travel_fee_enabled, freeMiles: text(l.travel_free_miles), perMile: text(l.travel_per_mile), baseFee: text(l.travel_base_fee), roundTrip: !!l.travel_round_trip };
}

/** Checks the travel fee; returns a message to show, or null. Nothing is checked while it's off. */
export function travelFeeError(v: TravelFeeValue): string | null {
  if (!v.enabled) return null;
  const free = num(v.freeMiles);
  const perMile = num(v.perMile);
  const base = num(v.baseFee);
  if (!Number.isInteger(free) || free < 0 || free > MAX_FREE_MILES) return `Free miles must be a whole number from 0 to ${MAX_FREE_MILES}.`;
  if (!Number.isFinite(perMile) || perMile < 0 || perMile > MAX_PER_MILE || !cents(perMile)) return `The price per mile can be from $0 to $${MAX_PER_MILE}.`;
  if (!Number.isFinite(base) || base < 0 || base > MAX_BASE_FEE || !cents(base)) return `The base travel fee can be from $0 to $${MAX_BASE_FEE.toLocaleString('en-US')}.`;
  if (perMile === 0 && base === 0) return 'Set a price per mile or a base fee, or turn the travel fee off.';
  return null;
}

/** Adds the travel fee to the package form data (an edit always sends it, so turning it off saves). */
export function appendTravelFee(fd: FormData, v: TravelFeeValue, clear: boolean) {
  if (!v.enabled && !clear) return;
  fd.append('travel_fee_enabled', String(v.enabled));
  if (!v.enabled) return;
  fd.append('travel_free_miles', String(num(v.freeMiles)));
  fd.append('travel_per_mile', String(num(v.perMile)));
  fd.append('travel_base_fee', String(num(v.baseFee)));
  fd.append('travel_round_trip', String(v.roundTrip));
}

/** The delivery fee as JSON (rental settings): turned off, the rates are kept for next time. */
export function travelFeeBody(v: TravelFeeValue) {
  return v.enabled
    ? { travel_fee_enabled: true, travel_free_miles: num(v.freeMiles), travel_per_mile: num(v.perMile), travel_base_fee: num(v.baseFee), travel_round_trip: v.roundTrip }
    : { travel_fee_enabled: false };
}

/** Whether the package form offers a travel fee: the vendor goes to the customer, and it isn't a venue. */
export function offersTravelFee(serviceAt: string, categoryName?: string | null): boolean {
  return serviceAt !== 'VENDOR_LOCATION' && categoryName?.trim().toLowerCase() !== 'venues';
}

/** "A customer 25 miles away pays $30.00 (50 miles there and back, 15 free, then $2.00 a mile)." */
export function travelExample(v: TravelFeeValue, milesAway = 25): string {
  const t: TravelTerms = { free_miles: num(v.freeMiles), per_mile: num(v.perMile), base_fee: num(v.baseFee), round_trip: v.roundTrip };
  const miles = t.round_trip ? round1(milesAway * 2) : milesAway;
  const chargeable = round1(Math.max(0, miles - t.free_miles));
  const fee = round2(t.base_fee + chargeable * t.per_mile);
  const parts = [t.round_trip ? `${miles} miles there and back` : `${miles} miles`];
  if (t.free_miles > 0) parts.push(`${t.free_miles} free`);
  if (t.per_mile > 0 && chargeable > 0) parts.push(`then ${money(t.per_mile)} a mile`);
  if (t.base_fee > 0) parts.push(`plus ${money(t.base_fee)}`);
  return `A customer ${milesAway} miles away pays ${money(fee)} (${parts.join(', ')}).`;
}

/** "About 30.0 miles away": the distance line under the address. */
export function distanceText(q: Pick<TravelQuote, 'one_way_miles' | 'miles' | 'terms'>): string | null {
  if (q.one_way_miles == null) return null;
  return q.terms.round_trip
    ? `About ${q.one_way_miles.toFixed(1)} miles away (${(q.miles ?? 0).toFixed(1)} miles there and back)`
    : `About ${q.one_way_miles.toFixed(1)} miles away`;
}
