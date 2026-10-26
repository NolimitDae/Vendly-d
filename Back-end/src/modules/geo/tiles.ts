/**
 * Map tiles for the small booking map, fetched through the API so the apps never call the tile server
 * directly: every request carries Vendly's User-Agent, as the OpenStreetMap tile policy asks, and recent
 * tiles are kept in memory. MAP_TILE_URL switches the source (e.g. Mapbox or Google) later.
 * Only signed-in users get tiles, and only at the zooms the booking map uses, so this can't be used to
 * copy the map in bulk.
 */

/** The booking map is drawn at zoom 15; a little either side is allowed. */
export const MIN_TILE_ZOOM = 13;
export const MAX_TILE_ZOOM = 17;
/** How long a tile may be cached by the app or browser (and in memory here). */
export const TILE_CACHE_SECONDS = 7 * 24 * 3600;
/** Tiles kept in memory: a few hundred bookings' worth, a few MB (never in the shared Redis). */
const MEMORY_TILES = 600;
/** Anything bigger is not a map tile. */
const MAX_TILE_BYTES = 512 * 1024;

export interface Tile {
  z: number;
  x: number;
  y: number;
}

const INT = /^\d{1,7}$/;

/** z/x/y from the URL (y may end in .png), or null when it isn't a tile that exists at that zoom. */
export function parseTile(z: string, x: string, y: string): Tile | null {
  const yy = String(y).replace(/\.png$/i, '');
  if (![z, x, yy].every((v) => INT.test(String(v)))) return null;
  const t = { z: Number(z), x: Number(x), y: Number(yy) };
  if (t.z < MIN_TILE_ZOOM || t.z > MAX_TILE_ZOOM) return null;
  const n = 2 ** t.z;
  return t.x < n && t.y < n ? t : null;
}

/** The tile server's address for a tile, from MAP_TILE_URL ({z}, {x}, {y}; {s} picks a subdomain). */
export function tileUrl(t: Tile, template = process.env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png') {
  return template
    .replace('{s}', 'abc'[(t.x + t.y) % 3])
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y));
}

export const tileKey = (t: Tile) => `map-tile:${t.z}/${t.x}/${t.y}`;

export interface TileCache {
  getBuffer(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer, mode: 'EX', seconds: number): Promise<unknown>;
}

/** A small in-memory cache that forgets the least recently used tile once it is full. */
export class MemoryTileCache implements TileCache {
  private items = new Map<string, { value: Buffer; until: number }>();
  constructor(private readonly max = MEMORY_TILES) {}

  async getBuffer(key: string) {
    const hit = this.items.get(key);
    if (!hit) return null;
    this.items.delete(key);
    if (hit.until < Date.now()) return null;
    this.items.set(key, hit);
    return hit.value;
  }

  async set(key: string, value: Buffer, _mode: 'EX', seconds: number) {
    this.items.delete(key);
    this.items.set(key, { value, until: Date.now() + seconds * 1000 });
    while (this.items.size > this.max) this.items.delete(this.items.keys().next().value!);
  }

  get size() {
    return this.items.size;
  }
}

export class TileError extends Error {}

/** The tile image from the cache, or from the tile server (then cached). Only images are passed on. */
export async function loadTile(t: Tile, cache: TileCache | null, fetchImpl: typeof fetch = fetch): Promise<{ body: Buffer; type: string }> {
  const key = tileKey(t);
  const hit = await cache?.getBuffer(key).catch(() => null);
  // stored as "<content type>\n<bytes>"
  if (hit) {
    const nl = hit.indexOf(10);
    if (nl > 0) return { type: hit.subarray(0, nl).toString(), body: hit.subarray(nl + 1) };
  }
  const contact = process.env.GEOCODER_CONTACT_EMAIL ?? 'support@vendly.app';
  const res = await fetchImpl(tileUrl(t), {
    headers: { 'User-Agent': `Vendly/1.0 (${contact})`, Accept: 'image/png,image/*' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new TileError(`Tile server answered ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new TileError(`Tile server sent ${type || 'no type'}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length || body.length > MAX_TILE_BYTES) throw new TileError('Tile too large or empty');
  await cache?.set(key, Buffer.concat([Buffer.from(`${type}\n`), body]), 'EX', TILE_CACHE_SECONDS).catch(() => null);
  return { body, type };
}
