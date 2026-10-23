import { __clearGeocodeCache, __clearPlaceCache, boundingBox, geocode, milesBetween, placeLabel, reversePlace, suggestPlaces } from './geo';
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

describe('place suggestions', () => {
  const feature = (props: Record<string, unknown>, lng: number, lat: number) => ({ properties: props, geometry: { coordinates: [lng, lat] } });
  beforeEach(() => __clearPlaceCache());

  it('labels US places with the state abbreviation and others with the country', () => {
    expect(placeLabel({ name: 'Brooklyn', city: 'New York', state: 'New York', countrycode: 'US' })).toBe('Brooklyn, New York, NY');
    expect(placeLabel({ housenumber: '12', street: 'Main St', city: 'Austin', state: 'Texas', countrycode: 'US' })).toBe('12 Main St, Austin, TX');
    expect(placeLabel({ name: 'Lagos', state: 'Lagos', country: 'Nigeria', countrycode: 'NG' })).toBe('Lagos, Nigeria');
  });

  it('returns de-duplicated places, biased near a point, and caches them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            feature({ name: 'Brooklyn', city: 'New York', state: 'New York', countrycode: 'US' }, -73.9497211, 40.6526006),
            feature({ name: 'Brooklyn', city: 'New York', state: 'New York', countrycode: 'US' }, -73.95, 40.65),
            feature({ name: 'Brooklyn', state: 'Iowa', countrycode: 'US' }, -92.44, 41.72),
          ],
        }),
    });
    const places = await suggestPlaces('brookl', { lat: 40.7, lng: -74 }, fetchMock as any);
    expect(places).toEqual([
      { label: 'Brooklyn, New York, NY', lat: 40.6526, lng: -73.94972 },
      { label: 'Brooklyn, IA', lat: 41.72, lng: -92.44 },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('lat=40.7');
    await suggestPlaces('Brookl ', { lat: 40.7, lng: -74 }, fetchMock as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await suggestPlaces('b', null, fetchMock as any)).toEqual([]);
  });

  it('names the place at a position but keeps the exact position', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ features: [feature({ name: 'New York', state: 'New York', countrycode: 'US' }, -74.0, 40.71)] }) });
    expect(await reversePlace(40.71283, -74.00597, fetchMock as any)).toEqual({ label: 'New York, NY', lat: 40.71283, lng: -74.00597 });
  });
});

