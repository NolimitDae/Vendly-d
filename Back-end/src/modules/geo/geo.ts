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

/** Photon (OpenStreetMap) feature -> "Name, City, ST" (US) or "Name, City, Country". */
export function placeLabel(p: Record<string, any>): string {
  const us = p.countrycode === 'US';
  const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street;
  const parts = [p.name ?? street, p.city ?? p.county, us ? (US_STATES[p.state] ?? p.state) : p.state, us ? null : p.country];
  const seen = new Set<string>();
  return parts
    .filter((x): x is string => !!x && !seen.has(x) && !!seen.add(x))
    .join(', ');
}

const placeCache = new Map<string, Place[]>();
const PHOTON = () => (process.env.PLACES_URL ?? 'https://photon.komoot.io').replace(/\/+$/, '');
const headers = () => ({ 'User-Agent': `Vendly/1.0 (${process.env.GEOCODER_CONTACT_EMAIL ?? 'support@vendly.app'})`, Accept: 'application/json' });

function toPlaces(body: any): Place[] {
  const out: Place[] = [];
  const labels = new Set<string>();
  for (const f of body?.features ?? []) {
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    const label = placeLabel(f?.properties ?? {});
    if (typeof lat !== 'number' || typeof lng !== 'number' || !label || labels.has(label)) continue;
    labels.add(label);
    out.push({ label, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
  }
  return out;
}

/** Places matching what's been typed so far, nearest to `near` first when given. */
export async function suggestPlaces(q: string, near?: { lat: number; lng: number } | null, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const text = q.trim().slice(0, 120);
  if (text.length < 2) return [];
  const key = `${text.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
  if (placeCache.has(key)) return placeCache.get(key)!;
  const params = new URLSearchParams({ q: text, limit: '6', lang: 'en' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetchImpl(`${PHOTON()}/api/?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`Place search answered ${res.status}`);
  const places = toPlaces(await res.json());
  if (placeCache.size > 2000) placeCache.clear();
  placeCache.set(key, places);
  return places;
}

/** The place at a position (for "use my current location"). */
export async function reversePlace(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  const res = await fetchImpl(`${PHOTON()}/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`, { headers: headers() });
  if (!res.ok) throw new Error(`Place lookup answered ${res.status}`);
  const [hit] = toPlaces(await res.json());
  // keep the exact position the phone reported
  return hit ? { ...hit, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 } : null;
}

export const __clearPlaceCache = () => placeCache.clear();
