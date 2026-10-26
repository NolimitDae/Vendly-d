/** Distance helpers for "near me" search. Pure, so they're unit-tested. */

const EARTH_MILES = 3958.8;
/** The furthest a vendor can say they travel for a package (also bounds the "near me" prefilter). */
export const MAX_SERVICE_RADIUS = 250;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A lat/lng box around a point that contains every spot within `miles` (cheap database prefilter). */
export function boundingBox(center: { lat: number; lng: number }, miles: number) {
  const dLat = miles / 69.0;
  const dLng = miles / Math.max(0.01, 69.172 * Math.cos(rad(center.lat)));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

const cache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Address text -> coordinates using OpenStreetMap Nominatim (free; their policy asks for an
 * identifying User-Agent and at most one request a second, which the hourly backfill respects).
 * GEOCODER_URL can point at another Nominatim-compatible service.
 */
export async function geocode(text: string, fetchImpl: typeof fetch = fetch): Promise<{ lat: number; lng: number } | null> {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q)!;
  const base = (process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
  const contact = process.env.GEOCODER_CONTACT_EMAIL ?? 'support@vendly.app';
  const res = await fetchImpl(`${base}/search?format=json&limit=1&q=${encodeURIComponent(text)}`, {
    headers: { 'User-Agent': `Vendly/1.0 (${contact})`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoder answered ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string }[];
  const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
  cache.set(q, hit);
  return hit;
}

export const __clearGeocodeCache = () => cache.clear();

// ─── Address suggestions (typing a package location) ─────────────────────────

export interface Place {
  /** what to show and store, e.g. "Brooklyn, New York, NY" */
  label: string;
  lat: number;
  lng: number;
}

const US_STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

/** A Photon feature that is itself a town or city (rather than something in one). */
const isTown = (p: Record<string, any>) => p.osm_key === 'place' || ['city', 'town', 'village', 'hamlet', 'locality', 'district'].includes(p.type);
/** The town something is in; a town itself isn't followed by its county ("Smyrna, DE", not "Smyrna, Kent, DE"). */
const townOf = (p: Record<string, any>) => p.city ?? (isTown(p) ? undefined : p.county);

/** Photon (OpenStreetMap) feature -> "Name, City, ST" (US) or "Name, City, Country". */
export function placeLabel(p: Record<string, any>): string {
  const us = p.countrycode === 'US';
  const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
  return joinParts([p.name ?? street, townOf(p), us ? (US_STATES[p.state] ?? p.state) : p.state, us ? null : p.country]);
}

function joinParts(parts: (string | null | undefined)[]) {
  const seen = new Set<string>();
  return parts
    .filter((x): x is string => !!x && !seen.has(x) && !!seen.add(x))
    .join(', ');
}

// ─── Street addresses (a booking venue, a business address) ──────────────────

const DIRECTIONS: Record<string, string> = {
  north: 'N', south: 'S', east: 'E', west: 'W', northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
};
const SHORT_DIRECTIONS = new Set(Object.values(DIRECTIONS));
const STREET_TYPES: Record<string, string> = {
  street: 'St', avenue: 'Ave', road: 'Rd', boulevard: 'Blvd', drive: 'Dr', lane: 'Ln', court: 'Ct', place: 'Pl',
  highway: 'Hwy', parkway: 'Pkwy', circle: 'Cir', terrace: 'Ter', square: 'Sq', trail: 'Trl', turnpike: 'Tpke',
};

/** "East Glenwood Avenue" -> "E Glenwood Ave", the way US addresses are written (and the Census geocoder answers). */
export function shortStreet(name: string): string {
  const words = name.trim().split(/\s+/);
  const dir = (i: number) => DIRECTIONS[words[i]?.toLowerCase()];
  const type = (i: number) => STREET_TYPES[words[i]?.toLowerCase()];
  const last = words.length - 1;
  // "North Street" stays as it is: there the direction is the street's own name
  if (words.length >= 3 && dir(0)) words[0] = dir(0);
  if (words.length >= 3 && dir(last) && type(last - 1)) {
    words[last] = dir(last);
    words[last - 1] = type(last - 1);
  } else if (words.length >= 2 && type(last)) {
    words[last] = type(last);
  }
  return words.join(' ');
}

/** "S MAIN ST" -> "S Main St": capitalised words, with directions, route prefixes and house numbers in capitals. */
export function titleCase(text: string): string {
  const upper = new Set([...SHORT_DIRECTIONS, 'US', 'SR', 'CR', 'FM', 'PO']);
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      if (upper.has(w.toUpperCase())) return w.toUpperCase();
      // "1ST" -> "1st", "12B" -> "12B"
      if (/^\d/.test(w)) return /^\d+(st|nd|rd|th)$/.test(w) ? w : w.toUpperCase();
      // "o'fallon" -> "O'Fallon", "winston-salem" -> "Winston-Salem"
      return w.replace(/(^|[-'])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
    })
    .join(' ');
}

/** Census "100 S MAIN ST, SMYRNA, DE, 19977" -> "100 S Main St, Smyrna, DE 19977". */
export function censusLabel(matched: string): string {
  const parts = matched.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 4) return titleCase(parts.join(', '));
  const [street, city, state, zip] = parts;
  return `${titleCase(street)}, ${titleCase(city)}, ${state.toUpperCase()} ${zip}`;
}

/** The house number typed at the start ("200 E Glenwood Ave" -> "200"), or null. */
export function typedHouseNumber(text: string): string | null {
  return /^(\d+[a-z]?(?:-\d+)?)\s+\S/i.exec(text.trim())?.[1] ?? null;
}

/** The direction typed after the house number ("200 East Glenwood" -> "E"), or null. */
function typedDirection(text: string): string | null {
  const w = /^\d+[a-z]?(?:-\d+)?\s+([a-z]+)\b/i.exec(text.trim())?.[1];
  if (!w) return null;
  return DIRECTIONS[w.toLowerCase()] ?? (SHORT_DIRECTIONS.has(w.toUpperCase()) ? w.toUpperCase() : null);
}

/** Whether the text is worth sending to the Census geocoder: a house number, a street and its town (or more). */
export function looksLikeStreetAddress(text: string): boolean {
  const t = text.trim();
  return !!typedHouseNumber(t) && t.length >= 8 && t.split(/[\s,]+/).length >= 4;
}

/**
 * Photon feature -> a street address label: "Smyrna Public Library, 400 Commerce St, Smyrna, DE 19977",
 * "100 S Main St, Smyrna, DE 19977". A street on its own (no house) gets the typed house number, so typing
 * "200 E Glenwood Ave" isn't answered with just the street. Towns stay short ("Smyrna, DE").
 */
export function streetLabel(p: Record<string, any>, houseNumber?: string | null): string {
  const us = p.countrycode === 'US';
  const isStreet = p.type === 'street';
  // OpenStreetMap can list several names ("Enon Springs Road West;Enon Springs Road"): the first is enough
  const streetName: string | undefined = (p.street ?? (isStreet ? p.name : undefined))?.split(';')[0].trim() || undefined;
  const number: string | undefined = p.housenumber ?? (isStreet && houseNumber ? houseNumber : undefined);
  const street = streetName ? [number, us ? shortStreet(streetName) : streetName].filter(Boolean).join(' ') : undefined;
  const state = us ? (US_STATES[p.state] ?? p.state) : p.state;
  // the ZIP code only goes with a street: a town can have several
  const region = street && p.postcode && state ? `${state} ${p.postcode}` : state;
  return joinParts([isStreet ? null : p.name, street, townOf(p), region, us ? null : p.country]);
}

const placeCache = new Map<string, Place[]>();
const censusCache = new Map<string, Place[]>();
const PHOTON = () => (process.env.PLACES_URL ?? 'https://photon.komoot.io').replace(/\/+$/, '');
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
/** The Census geocoder usually answers in well under a second; past this the suggestions go out without it. */
const CENSUS_TIMEOUT_MS = 2500;
const MAX_SUGGESTIONS = 6;
const headers = () => ({ 'User-Agent': `Vendly/1.0 (${process.env.GEOCODER_CONTACT_EMAIL ?? 'support@vendly.app'})`, Accept: 'application/json' });
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Vendly is in the US: when anything found is in the US, places elsewhere are left out. */
export function preferUS<T extends { properties?: Record<string, any> }>(features: T[]): T[] {
  const us = features.filter((f) => f?.properties?.countrycode === 'US');
  return us.length ? us : features;
}

function toPlaces(features: any[], label: (p: Record<string, any>) => string): Place[] {
  const out: Place[] = [];
  for (const f of features) {
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    const text = label(f?.properties ?? {});
    if (typeof lat !== 'number' || typeof lng !== 'number' || !text) continue;
    out.push({ label: text, lat: round5(lat), lng: round5(lng) });
  }
  return out;
}

/** Each label once (the first wins), and no more than the list shows. */
function distinct(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => !seen.has(p.label.toLowerCase()) && !!seen.add(p.label.toLowerCase())).slice(0, MAX_SUGGESTIONS);
}

/**
 * Exact US street address matches from the free Census geocoder (no key). Short timeout; a failure (null)
 * just means no matches this time, so Photon's suggestions still go out. Answers are cached, failures aren't.
 */
export async function censusMatches(text: string, near: { lat: number; lng: number } | null | undefined, fetchImpl: typeof fetch = fetch): Promise<Place[] | null> {
  const key = text.trim().toLowerCase();
  let places = censusCache.get(key);
  if (!places) {
    try {
      const params = new URLSearchParams({ address: text.trim(), benchmark: 'Public_AR_Current', format: 'json' });
      const res = await fetchImpl(`${CENSUS}?${params}`, { headers: headers(), signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS) });
      if (!res.ok) return null;
      const body = await res.json();
      const found: Place[] = [];
      for (const m of body?.result?.addressMatches ?? []) {
        const lng = Number(m?.coordinates?.x);
        const lat = Number(m?.coordinates?.y);
        if (!m?.matchedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        found.push({ label: censusLabel(String(m.matchedAddress)), lat: round5(lat), lng: round5(lng) });
      }
      if (censusCache.size > 2000) censusCache.clear();
      censusCache.set(key, found);
      places = found;
    } catch {
      return null;
    }
  }
  // the same street can be in several towns: the one nearest the person first
  return near ? [...places].sort((a, b) => milesBetween(near, a) - milesBetween(near, b)) : places;
}

async function photonFeatures(text: string, near: { lat: number; lng: number } | null | undefined, street: boolean, fetchImpl: typeof fetch): Promise<any[]> {
  // a few more than are shown, so places outside the US can be left out
  const params = new URLSearchParams({ q: text, limit: '10', lang: 'en' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  // street addresses are US only (towns can be anywhere, US first)
  if (street) params.set('countrycode', 'US');
  const res = await fetchImpl(`${PHOTON()}/api/?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`Place search answered ${res.status}`);
  const body = await res.json();
  return preferUS(body?.features ?? []);
}

/** Photon's street-mode answers as labels, ranked for the house number typed (if any). */
function streetPlaces(features: any[], text: string): Place[] {
  const house = typedHouseNumber(text);
  if (!house) return toPlaces(features, (p) => streetLabel(p));
  const dir = typedDirection(text);
  // the typed number on its street first, then streets (given the typed number), then the rest;
  // with a number typed, towns and areas don't help, so only places on a street are kept
  const rank = (p: Record<string, any>) => (p.housenumber === house ? 0 : p.type === 'street' ? 1 : 2);
  const ranked = features
    .filter((f) => f?.properties?.street || f?.properties?.type === 'street')
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.properties) - rank(b.f.properties) || a.i - b.i)
    .map(({ f }) => f);
  return toPlaces(ranked, (p) => {
    // "200 E Glenwood" mustn't turn West Glenwood Avenue into "200 W Glenwood Ave"
    const first = p.type === 'street' && p.name ? shortStreet(String(p.name)).split(' ')[0] : '';
    const otherSide = !!dir && SHORT_DIRECTIONS.has(first) && first !== dir;
    return streetLabel(p, otherSide ? null : house);
  });
}

/**
 * Places matching what's been typed so far, nearest to `near` first when given. `street` is for a full
 * street address (a booking venue, a business address): exact Census matches come first and labels carry
 * the street and ZIP code. Otherwise it is a town or area and labels stay short ("Smyrna, DE"): that is
 * all a package shows publicly.
 */
export async function suggestPlaces(q: string, near?: { lat: number; lng: number } | null, fetchImpl: typeof fetch = fetch, street = false): Promise<Place[]> {
  const text = q.trim().slice(0, 120);
  if (text.length < 2) return [];
  const key = `${street ? 'street' : 'area'}|${text.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
  if (placeCache.has(key)) return placeCache.get(key)!;
  let places: Place[];
  if (!street) {
    places = distinct(toPlaces(await photonFeatures(text, near, false, fetchImpl), placeLabel));
  } else {
    // asked together: the Census geocoder only knows full US addresses, Photon knows places and partial streets
    const [photon, census] = await Promise.all([
      photonFeatures(text, near, true, fetchImpl).catch((err: Error) => err),
      looksLikeStreetAddress(text) ? censusMatches(text, near, fetchImpl) : Promise.resolve([] as Place[]),
    ]);
    if (photon instanceof Error) {
      // the Census matches alone are still worth showing (not cached: the next keystroke asks Photon again)
      if (census?.length) return census.slice(0, MAX_SUGGESTIONS);
      throw photon;
    }
    places = distinct([...(census ?? []), ...streetPlaces(photon, text)]);
    // a slow or failed Census lookup isn't remembered as "no exact match": the next time asks again
    if (census === null) return places;
  }
  if (placeCache.size > 2000) placeCache.clear();
  placeCache.set(key, places);
  return places;
}

/** The place at a position (for "use my current location"). */
/**
 * The town or city at a position, for "use my current location". Only the area is named and the
 * position is rounded to about a kilometre, so a vendor working from home doesn't publish their street.
 */
export async function reversePlace(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  const res = await fetchImpl(`${PHOTON()}/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`, { headers: headers() });
  if (!res.ok) throw new Error(`Place lookup answered ${res.status}`);
  const body = await res.json();
  const p = body?.features?.[0]?.properties ?? {};
  // a place that is itself a town or city has its own name; anything smaller is named by its city
  const town = isTown(p) ? p.name : undefined;
  const label = placeLabel({ countrycode: p.countrycode, city: p.city ?? town ?? p.county, state: p.state, country: p.country });
  if (!label) return null;
  return { label, lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/** A listing without its map position: positions only drive "near me" on the server and are never sent out publicly. */
export function withoutPosition<T extends Record<string, any>>(listing: T): Omit<T, 'lat' | 'lng' | 'geocoded_at'> {
  const { lat: _lat, lng: _lng, geocoded_at: _at, ...rest } = listing;
  return rest;
}

export const __clearPlaceCache = () => {
  placeCache.clear();
  censusCache.clear();
};
