import { __clearGeocodeCache, __clearPlaceCache, addressPoint, boundingBox, censusLabel, geocode, looksLikeStreetAddress, milesBetween, placeLabel, reversePlace, shortStreet, streetLabel, suggestPlaces, titleCase, typedHouseNumber, withoutPosition } from './geo';
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

  it('names the city at a position, rounded to about a kilometre', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ features: [feature({ name: 'New York', type: 'city', osm_key: 'place', state: 'New York', countrycode: 'US' }, -74.0, 40.71)] }) });
    expect(await reversePlace(40.71283, -74.00597, fetchMock as any)).toEqual({ label: 'New York, NY', lat: 40.71, lng: -74.01 });
  });

  it("never names the street or house at someone's position", async () => {
    const house = feature({ housenumber: '12', street: 'Main St', city: 'Austin', state: 'Texas', countrycode: 'US', type: 'house', osm_key: 'building' }, -97.74, 30.27);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ features: [house] }) });
    const place = await reversePlace(30.26715, -97.74306, fetchMock as any);
    expect(place).toEqual({ label: 'Austin, TX', lat: 30.27, lng: -97.74 });
  });

  it('hides a listing position', () => {
    expect(withoutPosition({ id: 'l1', location: 'Austin, TX', lat: 30.2, lng: -97.7, geocoded_at: new Date() })).toEqual({ id: 'l1', location: 'Austin, TX' });
  });

  it('keeps US towns and leaves out same-named places abroad', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            feature({ name: 'Smyrna', state: 'İzmir', country: 'Türkiye', countrycode: 'TR', type: 'city' }, 27.14, 38.42),
            feature({ name: 'Smyrna', county: 'Kent', state: 'Delaware', countrycode: 'US', type: 'city', postcode: '19977' }, -75.6, 39.3),
            feature({ name: 'Smyrna', state: 'Georgia', countrycode: 'US', type: 'city' }, -84.51, 33.88),
          ],
        }),
    });
    // town level: short labels, no ZIP code
    expect((await suggestPlaces('Smyrna', null, fetchMock as any)).map((p) => p.label)).toEqual(['Smyrna, DE', 'Smyrna, GA']);
    expect(fetchMock.mock.calls[0][0]).not.toContain('countrycode');
    // only places abroad: still shown
    __clearPlaceCache();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ features: [feature({ name: 'Lagos', state: 'Lagos', country: 'Nigeria', countrycode: 'NG' }, 3.39, 6.45)] }) });
    expect(await suggestPlaces('Lagos', null, fetchMock as any)).toEqual([{ label: 'Lagos, Nigeria', lat: 6.45, lng: 3.39 }]);
  });
});

describe('street address suggestions', () => {
  const feature = (props: Record<string, unknown>, lng: number, lat: number) => ({ properties: { countrycode: 'US', ...props }, geometry: { coordinates: [lng, lat] } });
  const delaware = { city: 'Smyrna', state: 'Delaware', postcode: '19977' };
  const near = { lat: 39.3, lng: -75.6 };
  /** fetch answering Photon and the Census geocoder by URL (never the network) */
  const mockFetch = (photon: unknown[] | 'fail', census: { matchedAddress: string; coordinates: { x: number; y: number } }[] | 'fail' | 'hang' = []) =>
    jest.fn((url: string, init?: { signal?: AbortSignal }) => {
      if (url.includes('geocoding.geo.census.gov')) {
        if (census === 'fail') return Promise.resolve({ ok: false, status: 500 });
        if (census === 'hang') {
          return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { addressMatches: census } }) });
      }
      if (photon === 'fail') return Promise.resolve({ ok: false, status: 502 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ features: photon }) });
    });
  beforeEach(() => __clearPlaceCache());

  it('formats Census addresses and US street names', () => {
    expect(censusLabel('100 S MAIN ST, SMYRNA, DE, 19977')).toBe('100 S Main St, Smyrna, DE 19977');
    expect(censusLabel('12 W 1ST AVE, ST LOUIS, MO, 63101')).toBe('12 W 1st Ave, St Louis, MO 63101');
    expect(censusLabel('5 US HWY 13, WINSTON-SALEM, NC, 27101')).toBe('5 US Hwy 13, Winston-Salem, NC 27101');
    expect(titleCase("O'FALLON")).toBe("O'Fallon");
    expect(shortStreet('East Glenwood Avenue')).toBe('E Glenwood Ave');
    expect(shortStreet('North Street')).toBe('North St');
    expect(shortStreet('Main Street North')).toBe('Main St N');
    expect(streetLabel({ name: 'Smyrna Public Library', housenumber: '400', street: 'Commerce Street', ...delaware, countrycode: 'US', type: 'house' })).toBe(
      'Smyrna Public Library, 400 Commerce St, Smyrna, DE 19977',
    );
    expect(streetLabel({ name: 'East Glenwood Avenue', type: 'street', ...delaware, countrycode: 'US' })).toBe('E Glenwood Ave, Smyrna, DE 19977');
    expect(streetLabel({ name: 'Library', housenumber: '400', street: 'Enon Springs Road West;Enon Springs Road', city: 'Smyrna', state: 'Tennessee', postcode: '37167', countrycode: 'US', type: 'house' })).toBe(
      'Library, 400 Enon Springs Rd W, Smyrna, TN 37167',
    );
    // towns stay short even in street mode
    expect(streetLabel({ name: 'Smyrna', type: 'city', ...delaware, countrycode: 'US' })).toBe('Smyrna, DE');
    expect(typedHouseNumber('200 E Glenwood Ave')).toBe('200');
    expect(typedHouseNumber('Glenwood Ave')).toBeNull();
    expect(looksLikeStreetAddress('200 E Glenwood Ave Smyrna DE')).toBe(true);
    expect(looksLikeStreetAddress('200 E')).toBe(false);
    expect(looksLikeStreetAddress('100 S Main')).toBe(false);
  });

  it('places a service address for the travel fee: an exact Census match, else OpenStreetMap, else nothing', async () => {
    __clearGeocodeCache();
    const census = [{ matchedAddress: '100 S MAIN ST, SMYRNA, DE, 19977', coordinates: { x: -75.6047, y: 39.2998 } }];
    expect(await addressPoint('100 S Main St, Smyrna, DE 19977', mockFetch([], census) as any)).toEqual({ lat: 39.2998, lng: -75.6047 });
    // no exact match: OpenStreetMap (Nominatim answers a list of { lat, lon })
    const osm = jest.fn((url: string) =>
      Promise.resolve(url.includes('census.gov') ? { ok: true, json: () => Promise.resolve({ result: { addressMatches: [] } }) } : { ok: true, json: () => Promise.resolve([{ lat: '39.3', lon: '-75.6' }]) }),
    );
    expect(await addressPoint('Smyrna Town Hall, Delaware', osm as any)).toEqual({ lat: 39.3, lng: -75.6 });
    const down = jest.fn(() => Promise.resolve({ ok: false, status: 503 }));
    expect(await addressPoint('27 Nowhere Lane Atlantis ZZ', down as any)).toBeNull();
    expect(await addressPoint('   ', down as any)).toBeNull();
  });

  it('does not remember a failed Census lookup as "no exact match"', async () => {
    const census = [{ matchedAddress: '100 S MAIN ST, SMYRNA, DE, 19977', coordinates: { x: -75.6047, y: 39.2998 } }];
    const first = await suggestPlaces('100 S Main St Smyrna DE', near, mockFetch([], 'fail') as any, true);
    expect(first).toEqual([]);
    const again = await suggestPlaces('100 S Main St Smyrna DE', near, mockFetch([], census) as any, true);
    expect(again.map((p) => p.label)).toEqual(['100 S Main St, Smyrna, DE 19977']);
  });

  it('puts exact Census matches first and keeps the typed house number on a bare street', async () => {
    const fetchMock = mockFetch(
      [
        feature({ name: 'West Glenwood Avenue', type: 'street', ...delaware }, -75.6111, 39.30286),
        feature({ name: 'East Glenwood Avenue', type: 'street', ...delaware }, -75.60716, 39.30593),
        feature({ name: 'Smyrna Police Department', housenumber: '325', street: 'West Glenwood Avenue', type: 'house', ...delaware }, -75.61388, 39.29997),
        feature({ name: 'Smyrna', type: 'city', ...delaware }, -75.6, 39.3),
      ],
      [{ matchedAddress: '200 E GLENWOOD AVE, SMYRNA, DE, 19977', coordinates: { x: -75.607860614109, y: 39.305557736471 } }],
    );
    const places = await suggestPlaces('200 E Glenwood Ave Smyrna DE', near, fetchMock as any, true);
    expect(places).toEqual([
      { label: '200 E Glenwood Ave, Smyrna, DE 19977', lat: 39.30556, lng: -75.60786 },
      // the street with the typed number (the Census match above already has it), the other side without it
      { label: 'W Glenwood Ave, Smyrna, DE 19977', lat: 39.30286, lng: -75.6111 },
      { label: 'Smyrna Police Department, 325 W Glenwood Ave, Smyrna, DE 19977', lat: 39.29997, lng: -75.61388 },
    ]);
    const photonUrl = fetchMock.mock.calls.find(([u]) => u.includes('/api/'))![0];
    expect(photonUrl).toContain('countrycode=US');
    expect(photonUrl).toContain('lat=39.3');
    // cached: typing the same again asks nobody
    await suggestPlaces('200 E Glenwood Ave Smyrna DE ', near, fetchMock as any, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the typed number when Photon only knows the street', async () => {
    const fetchMock = mockFetch([feature({ name: 'East Glenwood Avenue', type: 'street', ...delaware }, -75.60716, 39.30593)], 'fail');
    expect(await suggestPlaces('200 East Glenwood Ave Smyrna', near, fetchMock as any, true)).toEqual([
      { label: '200 E Glenwood Ave, Smyrna, DE 19977', lat: 39.30593, lng: -75.60716 },
    ]);
  });

  it('ranks the typed house number first, then places on the street, and drops towns', async () => {
    const fetchMock = mockFetch([
      feature({ name: 'The Skyline Cafe', housenumber: '7', street: 'South Main Street', type: 'house', ...delaware }, -75.6, 39.3),
      feature({ name: 'Smyrna', type: 'city', ...delaware }, -75.6, 39.3),
      feature({ name: 'Smyrna Health Center', housenumber: '100', street: 'South Main Street', type: 'house', ...delaware }, -75.60473, 39.29981),
    ]);
    const labels = (await suggestPlaces('100 S Main', near, fetchMock as any, true)).map((p) => p.label);
    expect(labels).toEqual(['Smyrna Health Center, 100 S Main St, Smyrna, DE 19977', 'The Skyline Cafe, 7 S Main St, Smyrna, DE 19977']);
    // too short to be a full address: the Census geocoder isn't asked
    expect(fetchMock.mock.calls.some(([u]) => u.includes('census'))).toBe(false);
  });

  it('orders Census matches by distance and de-duplicates them against Photon', async () => {
    const fetchMock = mockFetch(
      [feature({ housenumber: '123', street: 'Main Street', type: 'house', ...delaware }, -75.6, 39.3)],
      [
        { matchedAddress: '123 MAIN ST, SMYRNA, TN, 37167', coordinates: { x: -86.51636, y: 35.98296 } },
        { matchedAddress: '123 MAIN ST, SMYRNA, DE, 19977', coordinates: { x: -75.6, y: 39.3 } },
      ],
    );
    const labels = (await suggestPlaces('123 main st smyrna', near, fetchMock as any, true)).map((p) => p.label);
    expect(labels).toEqual(['123 Main St, Smyrna, DE 19977', '123 Main St, Smyrna, TN 37167']);
  });

  it('ignores a slow or failing Census geocoder, and shows its matches when Photon fails', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const slow = mockFetch([feature({ name: 'East Glenwood Avenue', type: 'street', ...delaware }, -75.60716, 39.30593)], 'hang');
      const pending = suggestPlaces('200 E Glenwood Ave Smyrna', near, slow as any, true);
      await jest.advanceTimersByTimeAsync(3000);
      expect((await pending).map((p) => p.label)).toEqual(['200 E Glenwood Ave, Smyrna, DE 19977']);
    } finally {
      jest.useRealTimers();
    }
    const census = mockFetch('fail', [{ matchedAddress: '100 S MAIN ST, SMYRNA, DE, 19977', coordinates: { x: -75.60473, y: 39.29981 } }]);
    expect((await suggestPlaces('100 S Main St Smyrna DE', near, census as any, true)).map((p) => p.label)).toEqual(['100 S Main St, Smyrna, DE 19977']);
    await expect(suggestPlaces('101 S Main St Smyrna DE', near, mockFetch('fail', 'fail') as any, true)).rejects.toThrow('502');
  });
});

