/**
 * Delivery / travel fee by distance, set per package (owner's ask, Nov 2026: "can we have it in the package
 * set up and we calculate it for the vendor and they can set the price").
 *
 * The vendor sets, per package: the miles that are free, a price per mile after them, an optional flat
 * base fee, and whether the miles count one way or there and back. Vendly works out the distance from the
 * package's map position to the service address: the straight line plus 20% (roughly the road miles; no
 * routing service is used).
 *
 *   miles      = straight line × 1.2, rounded to one decimal (doubled for a round trip)
 *   chargeable = max(0, miles − free miles)
 *   fee        = base fee + chargeable × price per mile, rounded to cents
 *
 * The rounded miles are what the customer sees, so the sum can be checked by hand. When either point has
 * no map position the fee isn't guessed: the request goes out without one and says so, and the vendor can
 * add it by suggesting changes (contracts/request-changes.ts) before they accept.
 *
 * Pure functions, so the apps' quote and the server's charge come from the same rules.
 */
import { round2 } from 'src/modules/add-ons/pricing';
import { milesBetween } from 'src/modules/geo/geo';
import { needsServiceAddress, PlaceRulesListing } from './booking-place';

/** Straight-line miles are multiplied by this to approximate road miles. */
export const ROAD_FACTOR = 1.2;
/** Limits on a package's travel settings. */
export const MAX_FREE_MILES = 250;
export const MAX_PER_MILE = 50;
export const MAX_BASE_FEE = 1000;

type Money = number | string | { toString(): string } | null | undefined;

/** A package's travel settings, as stored on the listing. */
export interface TravelListing extends PlaceRulesListing {
  travel_fee_enabled?: boolean | null;
  travel_free_miles?: number | null;
  travel_per_mile?: Money;
  travel_base_fee?: Money;
  travel_round_trip?: boolean | null;
  service_radius_miles?: number | null;
}

/** The rates a fee is worked out with (frozen on the booking). */
export interface TravelTerms {
  free_miles: number;
  per_mile: number;
  base_fee: number;
  round_trip: boolean;
}

export interface Point {
  lat: number;
  lng: number;
}

/** What the booking request is for, as far as travel goes. */
export interface TravelRequest {
  venue_address?: string | null;
}

/** The travel fee worked out for one booking (or why it couldn't be). */
export interface TravelQuote {
  /**
   * PRICED: worked out from the map; UNPRICED: the address or the package has no map position (no fee yet);
   * VENDOR: set by the vendor in suggested changes, and approved by the customer
   */
  status: 'PRICED' | 'UNPRICED' | 'VENDOR';
  terms: TravelTerms;
  /** estimated road miles one way, one decimal */
  one_way_miles: number | null;
  /** the miles counted: one way, or there and back */
  miles: number | null;
  /** the miles charged for, after the free ones */
  chargeable_miles: number | null;
  fee: number | null;
  /** "30.0 miles round trip, first 15 free: 15.0 × $2.00" */
  label: string;
  /** further than the vendor's travel radius (service_radius_miles), when they set one */
  outside_area: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => `$${n.toFixed(2)}`;
const num = (v: Money) => (v == null || v === '' ? 0 : Number(v));

/** The package's travel rates, or null when it charges no travel fee. */
export function travelTermsOf(listing: TravelListing | null | undefined): TravelTerms | null {
  if (!listing?.travel_fee_enabled) return null;
  return {
    free_miles: Math.max(0, Math.floor(num(listing.travel_free_miles))),
    per_mile: round2(Math.max(0, num(listing.travel_per_mile))),
    base_fee: round2(Math.max(0, num(listing.travel_base_fee))),
    round_trip: !!listing.travel_round_trip,
  };
}

/**
 * Whether a travel fee applies to this booking: the package charges one, and the service happens at the
 * customer's address. The one place this is decided (a booking where the customer comes to the vendor
 * instead has none).
 */
export function travelFeeApplies(listing: TravelListing | null | undefined, _request: TravelRequest): boolean {
  return !!travelTermsOf(listing) && needsServiceAddress(listing);
}

/** The fee for a road distance (one way) on these rates. */
export function feeForMiles(terms: TravelTerms, oneWayMiles: number) {
  const oneWay = round1(Math.max(0, oneWayMiles));
  const miles = terms.round_trip ? round1(oneWay * 2) : oneWay;
  const chargeable = round1(Math.max(0, miles - terms.free_miles));
  return { one_way_miles: oneWay, miles, chargeable_miles: chargeable, fee: round2(terms.base_fee + chargeable * terms.per_mile) };
}

/** "Free within 15 miles, then $2.00 a mile (round trip)": the rates in a line, for the package page. */
export function travelTermsText(t: TravelTerms): string {
  const parts: string[] = [];
  if (t.base_fee > 0) parts.push(`${money(t.base_fee)} travel fee`);
  if (t.per_mile > 0) parts.push(t.free_miles > 0 ? `free within ${t.free_miles} miles, then ${money(t.per_mile)} a mile` : `${money(t.per_mile)} a mile`);
  else if (t.free_miles > 0 && t.base_fee === 0) parts.push(`free within ${t.free_miles} miles`);
  const text = parts.join(', plus ') || 'No travel fee';
  const counted = t.per_mile > 0 ? (t.round_trip ? ' (miles counted there and back)' : ' (miles counted one way)') : '';
  return text.charAt(0).toUpperCase() + text.slice(1) + counted;
}

/** "30.0 miles round trip, first 15 free: $25.00 + 15.0 × $2.00", for the contract and the booking. */
export function travelLabel(terms: TravelTerms, f: { miles: number; chargeable_miles: number }): string {
  const trip = `${f.miles.toFixed(1)} miles ${terms.round_trip ? 'round trip' : 'one way'}`;
  const free = terms.free_miles > 0 ? `, first ${terms.free_miles} free` : '';
  const sum: string[] = [];
  if (terms.base_fee > 0) sum.push(money(terms.base_fee));
  if (f.chargeable_miles > 0 && terms.per_mile > 0) sum.push(`${f.chargeable_miles.toFixed(1)} × ${money(terms.per_mile)}`);
  return `${trip}${free}${sum.length ? `: ${sum.join(' + ')}` : ''}`;
}

/** Said when the fee can't be worked out from the map. */
export const UNPRICED_TEXT = 'We couldn’t place this address on the map, so the travel fee isn’t worked out yet. The vendor can add it before they accept, and you approve it first.';

/**
 * The travel fee for a booking from the package's map position to the service address. Without either
 * position it is UNPRICED (nothing is guessed).
 */
export function priceTravel(listing: TravelListing & { lat?: number | null; lng?: number | null }, to: Point | null | undefined): TravelQuote {
  const terms = travelTermsOf(listing) ?? { free_miles: 0, per_mile: 0, base_fee: 0, round_trip: false };
  const from = listing.lat != null && listing.lng != null ? { lat: listing.lat, lng: listing.lng } : null;
  if (!from || !to || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    return { status: 'UNPRICED', terms, one_way_miles: null, miles: null, chargeable_miles: null, fee: null, label: 'Not worked out yet', outside_area: false };
  }
  const straight = milesBetween(from, to);
  const f = feeForMiles(terms, straight * ROAD_FACTOR);
  // the vendor's radius is a straight-line reach (as "near me" search uses it): only a warning, never a block
  const radius = listing.service_radius_miles;
  return { status: 'PRICED', terms, ...f, label: travelLabel(terms, f), outside_area: !!radius && straight > radius };
}

/** A travel quote as stored on a booking (travel_details), or null. */
export function readTravel(details: unknown): TravelQuote | null {
  const d = details as Partial<TravelQuote> | null;
  return d && typeof d === 'object' && (d.status === 'PRICED' || d.status === 'UNPRICED' || d.status === 'VENDOR') && d.terms ? (d as TravelQuote) : null;
}

/** The travel fee the vendor set for one booking (suggested changes): the miles, if known, are kept for reference. */
export function vendorSetTravel(before: TravelQuote, fee: number): TravelQuote {
  const miles = before.miles != null ? `${before.miles.toFixed(1)} miles ${before.terms.round_trip ? 'round trip' : 'one way'}, ` : '';
  return { ...before, status: 'VENDOR', fee: round2(fee), label: `${miles}set by the vendor` };
}

/** Thrown with a message the vendor can act on. */
export class TravelSettingsError extends Error {}

/** What a package form sends about its travel fee (all optional: left out keeps what's saved). */
export interface TravelSettingsInput {
  travel_fee_enabled?: boolean;
  travel_free_miles?: number | null;
  travel_per_mile?: number | null;
  travel_base_fee?: number | null;
  travel_round_trip?: boolean;
}

/**
 * The travel columns to save, checked together with what's saved already. Turned on, it needs a price per
 * mile or a base fee (otherwise it would always be free). Turned off, the rates are kept for next time.
 */
export function travelSettings(sent: TravelSettingsInput, saved: TravelListing = {}): Record<string, unknown> {
  const touched = (['travel_fee_enabled', 'travel_free_miles', 'travel_per_mile', 'travel_base_fee', 'travel_round_trip'] as const).some((k) => sent[k] !== undefined);
  if (!touched) return {};
  const pick = <K extends keyof TravelSettingsInput>(k: K) => (sent[k] !== undefined ? sent[k] : (saved as Record<string, unknown>)[k]);
  const enabled = !!pick('travel_fee_enabled');
  const free = pick('travel_free_miles') == null ? null : Number(pick('travel_free_miles'));
  const perMile = pick('travel_per_mile') == null ? null : round2(Number(pick('travel_per_mile')));
  const base = pick('travel_base_fee') == null ? null : round2(Number(pick('travel_base_fee')));
  if (free != null && (!Number.isInteger(free) || free < 0 || free > MAX_FREE_MILES)) throw new TravelSettingsError(`Free miles must be a whole number from 0 to ${MAX_FREE_MILES}.`);
  if (perMile != null && (!Number.isFinite(perMile) || perMile < 0 || perMile > MAX_PER_MILE)) throw new TravelSettingsError(`The price per mile can be up to $${MAX_PER_MILE}.`);
  if (base != null && (!Number.isFinite(base) || base < 0 || base > MAX_BASE_FEE)) throw new TravelSettingsError(`The base travel fee can be up to $${MAX_BASE_FEE.toLocaleString('en-US')}.`);
  if (enabled && !(perMile && perMile > 0) && !(base && base > 0)) throw new TravelSettingsError('Set a price per mile or a base fee, or turn the travel fee off.');
  return {
    travel_fee_enabled: enabled,
    travel_free_miles: free || null,
    travel_per_mile: perMile || null,
    travel_base_fee: base || null,
    travel_round_trip: !!pick('travel_round_trip'),
  };
}

/** The travel settings as the package pages show them (null when the package has no travel fee). */
export function travelSummary(listing: TravelListing | null | undefined) {
  const t = travelTermsOf(listing);
  if (!t || !needsServiceAddress(listing)) return null;
  return { ...t, text: travelTermsText(t) };
}
