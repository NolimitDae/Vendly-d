import { __clearGeocodeCache, boundingBox, geocode, milesBetween } from './geo';
import { GeocodeService } from './geocode.service';

const houston = { lat: 29.7604, lng: -95.3698 };
const katy = { lat: 29.7858, lng: -95.8245 };
const dallas = { lat: 32.7767, lng: -96.797 };

describe('geo', () => {
  it('measures miles between two points', () => {
    expect(milesBetween(houston, katy)).toBeGreaterThan(26);
    expect(milesBetween(houston, katy)).toBeLessThan(29);
    expect(milesBetween(houston, dallas)).toBeGreaterThan(220);
    expect(milesBetween(houston, houston)).toBe(0);
  });

  it('builds a box that contains everything inside the radius', () => {
    const box = boundingBox(houston, 30);
    expect(katy.lat).toBeGreaterThan(box.minLat);
    expect(katy.lat).toBeLessThan(box.maxLat);
    expect(katy.lng).toBeGreaterThan(box.minLng);
    expect(katy.lng).toBeLessThan(box.maxLng);
    expect(dallas.lat).toBeGreaterThan(box.maxLat);
  });

  it('geocodes with an identifying user agent and caches the answer', async () => {
    __clearGeocodeCache();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ lat: '29.76', lon: '-95.37' }]) });
    expect(await geocode('Houston, TX', fetchMock as any)).toEqual({ lat: 29.76, lng: -95.37 });
    expect(await geocode('houston, tx ', fetchMock as any)).toEqual({ lat: 29.76, lng: -95.37 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/^Vendly/);
  });
});

describe('GeocodeService', () => {
  it('marks a listing done even when the place is not found, and retries later on errors', async () => {
    const prisma: any = { vendorListing: { findUnique: jest.fn().mockResolvedValue({ location: 'Nowhere-at-all' }), update: jest.fn() } };
    __clearGeocodeCache();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    const svc = new GeocodeService(prisma);
    await svc.listing('l1');
    expect(prisma.vendorListing.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { lat: null, lng: null, geocoded_at: expect.any(Date) } });
    prisma.vendorListing.update.mockClear();
    prisma.vendorListing.findUnique.mockResolvedValue({ location: 'Somewhere else' });
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await svc.listing('l2');
    expect(prisma.vendorListing.update).not.toHaveBeenCalled();
  });
});
