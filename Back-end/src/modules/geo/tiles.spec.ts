import { loadTile, MemoryTileCache, parseTile, tileKey, tileUrl } from './tiles';
import { GeocodeService } from './geocode.service';
import { __clearGeocodeCache } from './geo';

describe('map tile proxy', () => {
  it('accepts only tiles that exist at their zoom', () => {
    expect(parseTile('15', '7559', '13529')).toEqual({ z: 15, x: 7559, y: 13529 });
    expect(parseTile('15', '7559', '13529.png')).toEqual({ z: 15, x: 7559, y: 13529 });
    expect(parseTile('15', '32768', '0')).toBeNull(); // only 32768 tiles across at zoom 15
    // only the zooms the booking map uses, so the proxy can't be used to copy the map in bulk
    expect(parseTile('0', '0', '0')).toBeNull();
    expect(parseTile('12', '0', '0')).toBeNull();
    expect(parseTile('18', '0', '0')).toBeNull();
    expect(parseTile('13', '0', '0')).toEqual({ z: 13, x: 0, y: 0 });
    expect(parseTile('-1', '0', '0')).toBeNull();
    expect(parseTile('3', '1.5', '2')).toBeNull();
    expect(parseTile('3', '1', '../2')).toBeNull();
    expect(parseTile('3', '1', '2.jpg')).toBeNull();
    expect(parseTile('3', 'abc', '2')).toBeNull();
  });

  it('keeps recent tiles in memory and forgets the oldest once full', async () => {
    const cache = new MemoryTileCache(2);
    await cache.set('a', Buffer.from('a'), 'EX', 60);
    await cache.set('b', Buffer.from('b'), 'EX', 60);
    await cache.getBuffer('a'); // a was used, so b is the oldest
    await cache.set('c', Buffer.from('c'), 'EX', 60);
    expect(cache.size).toBe(2);
    expect(await cache.getBuffer('b')).toBeNull();
    expect((await cache.getBuffer('a'))?.toString()).toBe('a');
    await cache.set('old', Buffer.from('x'), 'EX', -1);
    expect(await cache.getBuffer('old')).toBeNull();
  });

  it('builds the tile server address from MAP_TILE_URL', () => {
    expect(tileUrl({ z: 3, x: 1, y: 2 })).toBe('https://tile.openstreetmap.org/3/1/2.png');
    expect(tileUrl({ z: 3, x: 1, y: 2 }, 'https://api.mapbox.com/styles/v1/x/tiles/{z}/{x}/{y}?access_token=t')).toBe('https://api.mapbox.com/styles/v1/x/tiles/3/1/2?access_token=t');
    expect(tileUrl({ z: 3, x: 1, y: 1 }, 'https://{s}.tile.example/{z}/{x}/{y}.png')).toBe('https://c.tile.example/3/1/1.png');
  });

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const cacheMock = () => {
    const store = new Map<string, Buffer>();
    return {
      store,
      getBuffer: jest.fn(async (k: string) => store.get(k) ?? null),
      set: jest.fn(async (k: string, v: Buffer) => void store.set(k, v)),
    };
  };
  const answer = (type: string, body = png, ok = true) =>
    jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, headers: { get: () => type }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) });

  it('fetches with Vendly’s User-Agent, caches for days, then answers from the cache', async () => {
    const cache = cacheMock();
    const fetchMock = answer('image/png');
    const t = { z: 15, x: 7559, y: 13529 };
    const first = await loadTile(t, cache, fetchMock as any);
    expect(first).toEqual({ body: png, type: 'image/png' });
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/^Vendly\/1\.0 \(/);
    expect(cache.set).toHaveBeenCalledWith(tileKey(t), expect.any(Buffer), 'EX', 7 * 24 * 3600);

    const again = await loadTile(t, cache, fetchMock as any);
    expect(again).toEqual({ body: png, type: 'image/png' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes on only images, and caches nothing that failed', async () => {
    const cache = cacheMock();
    await expect(loadTile({ z: 1, x: 0, y: 0 }, cache, answer('text/html', Buffer.from('<html>')) as any)).rejects.toThrow('text/html');
    await expect(loadTile({ z: 1, x: 0, y: 0 }, cache, answer('image/png', png, false) as any)).rejects.toThrow('503');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('still works without a cache', async () => {
    expect(await loadTile({ z: 1, x: 1, y: 1 }, null, answer('image/png') as any)).toEqual({ body: png, type: 'image/png' });
  });
});

describe('GeocodeService for bookings and business addresses', () => {
  beforeEach(() => __clearGeocodeCache());

  it('puts a booking venue on the map, only if the address is still the same', async () => {
    const prisma: any = { booking: { findUnique: jest.fn().mockResolvedValue({ venue_address: '12 Main St, Austin, TX' }), updateMany: jest.fn() } };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ lat: '30.27', lon: '-97.74' }]) });
    await new GeocodeService(prisma).booking('b1');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', venue_address: '12 Main St, Austin, TX' },
      data: { venue_lat: 30.27, venue_lng: -97.74, venue_geocoded_at: expect.any(Date) },
    });
  });

  it('never throws, and leaves a failed lookup for the hourly retry', async () => {
    const prisma: any = { booking: { findUnique: jest.fn().mockResolvedValue({ venue_address: 'Somewhere' }), updateMany: jest.fn() } };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(new GeocodeService(prisma).booking('b1')).resolves.toBeUndefined();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('puts a vendor’s business address on the map', async () => {
    const prisma: any = { vendorProfile: { findUnique: jest.fn().mockResolvedValue({ business_address: '1 Shop St, Austin, TX' }), updateMany: jest.fn() } };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ lat: '30.2', lon: '-97.7' }]) });
    await new GeocodeService(prisma).businessAddress('v1');
    expect(prisma.vendorProfile.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'v1', business_address: '1 Shop St, Austin, TX' },
      data: { business_lat: 30.2, business_lng: -97.7, business_geocoded_at: expect.any(Date) },
    });
  });
});
