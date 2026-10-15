/** Distance helpers for "near me" search. Pure, so they're unit-tested. */

const EARTH_MILES = 3958.8;
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
