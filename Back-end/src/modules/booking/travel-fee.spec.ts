import { feeForMiles, priceTravel, readTravel, travelFeeApplies, travelLabel, travelSettings, TravelSettingsError, travelSummary, travelTermsOf, travelTermsText, vendorSetTravel } from './travel-fee';

// a point `miles` due north of the package (straight line), so the distances are exact
const MILES_PER_DEGREE = (3958.8 * Math.PI) / 180;
const base = { lat: 30.2672, lng: -97.7431 };
const north = (miles: number) => ({ lat: base.lat + miles / MILES_PER_DEGREE, lng: base.lng });

const pkg = (over: Record<string, unknown> = {}) => ({
  ...base,
  service_at: 'CUSTOMER_LOCATION',
  category: { name: 'DJs' },
  travel_fee_enabled: true,
  travel_free_miles: 15,
  travel_per_mile: '2.00',
  travel_base_fee: null,
  travel_round_trip: false,
  ...over,
});

describe('travel fee', () => {
  it('one way: straight line plus 20%, the free miles off, then the rate', () => {
    // 25 miles in a straight line is 30.0 road miles; 15 are free
    const q = priceTravel(pkg(), north(25));
    expect(q).toMatchObject({ status: 'PRICED', one_way_miles: 30, miles: 30, chargeable_miles: 15, fee: 30, outside_area: false });
    expect(q.label).toBe('30.0 miles one way, first 15 free: 15.0 × $2.00');
  });

  it('round trip counts the miles there and back', () => {
    const q = priceTravel(pkg({ travel_round_trip: true }), north(25));
    expect(q).toMatchObject({ one_way_miles: 30, miles: 60, chargeable_miles: 45, fee: 90 });
    expect(q.label).toBe('60.0 miles round trip, first 15 free: 45.0 × $2.00');
  });

  it('adds a flat base fee', () => {
    // "$25 delivery + $1.50 a mile after 10 miles"
    const q = priceTravel(pkg({ travel_free_miles: 10, travel_per_mile: 1.5, travel_base_fee: 25 }), north(25));
    expect(q.fee).toBe(55);
    expect(q.label).toBe('30.0 miles one way, first 10 free: $25.00 + 20.0 × $1.50');
  });

  it('inside the free miles costs nothing (the base fee still applies)', () => {
    expect(priceTravel(pkg(), north(5))).toMatchObject({ miles: 6, chargeable_miles: 0, fee: 0, label: '6.0 miles one way, first 15 free' });
    expect(priceTravel(pkg({ travel_base_fee: 20 }), north(5)).fee).toBe(20);
  });

  it('never guesses without a map position at either end', () => {
    expect(priceTravel(pkg(), null)).toMatchObject({ status: 'UNPRICED', fee: null, miles: null });
    expect(priceTravel(pkg({ lat: null, lng: null }), north(10))).toMatchObject({ status: 'UNPRICED', fee: null });
    expect(priceTravel(pkg(), { lat: NaN, lng: 1 }).status).toBe('UNPRICED');
  });

  it('rounds the miles to one decimal and the fee to cents', () => {
    expect(feeForMiles({ free_miles: 0, per_mile: 1.33, base_fee: 0, round_trip: false }, 10.66)).toEqual({ one_way_miles: 10.7, miles: 10.7, chargeable_miles: 10.7, fee: 14.23 });
    expect(feeForMiles({ free_miles: 3, per_mile: 0.99, base_fee: 0.01, round_trip: true }, 7.04)).toEqual({ one_way_miles: 7, miles: 14, chargeable_miles: 11, fee: 10.9 });
  });

  it('warns when the address is further than the vendor travels, without blocking', () => {
    expect(priceTravel(pkg({ service_radius_miles: 20 }), north(25))).toMatchObject({ status: 'PRICED', fee: 30, outside_area: true });
    expect(priceTravel(pkg({ service_radius_miles: 30 }), north(25)).outside_area).toBe(false);
  });

  it('applies only when the package charges one and the vendor goes to the customer', () => {
    expect(travelFeeApplies(pkg(), {})).toBe(true);
    expect(travelFeeApplies(pkg({ travel_fee_enabled: false }), {})).toBe(false);
    expect(travelFeeApplies(pkg({ service_at: 'VENDOR_LOCATION' }), {})).toBe(false);
    expect(travelFeeApplies(pkg({ category: { name: 'Venues' } }), {})).toBe(false);
    expect(travelFeeApplies(null, {})).toBe(false);
  });

  it('reads the rates and says them in a line', () => {
    expect(travelTermsOf(pkg({ travel_fee_enabled: false }))).toBeNull();
    expect(travelTermsText(travelTermsOf(pkg())!)).toBe('Free within 15 miles, then $2.00 a mile (miles counted one way)');
    expect(travelTermsText(travelTermsOf(pkg({ travel_base_fee: 25, travel_free_miles: 10, travel_per_mile: 1.5, travel_round_trip: true }))!)).toBe(
      '$25.00 travel fee, plus free within 10 miles, then $1.50 a mile (miles counted there and back)',
    );
    expect(travelTermsText(travelTermsOf(pkg({ travel_base_fee: 40, travel_free_miles: null, travel_per_mile: null }))!)).toBe('$40.00 travel fee');
    expect(travelSummary(pkg({ service_at: 'VENDOR_LOCATION' }))).toBeNull();
    expect(travelSummary(pkg())).toMatchObject({ free_miles: 15, per_mile: 2, base_fee: 0, round_trip: false });
  });

  it('the vendor can set the fee for one booking; stored quotes are read back', () => {
    const q = priceTravel(pkg({ travel_round_trip: true }), north(25));
    const set = vendorSetTravel(q, 75.555);
    expect(set).toMatchObject({ status: 'VENDOR', fee: 75.56, miles: 60, label: '60.0 miles round trip, set by the vendor' });
    expect(vendorSetTravel(priceTravel(pkg(), null), 40).label).toBe('set by the vendor');
    expect(readTravel(JSON.parse(JSON.stringify(set)))).toEqual(set);
    expect(readTravel({ status: 'nope' })).toBeNull();
    expect(readTravel(null)).toBeNull();
    expect(travelLabel({ free_miles: 0, per_mile: 2, base_fee: 0, round_trip: false }, { miles: 4.5, chargeable_miles: 4.5 })).toBe('4.5 miles one way: 4.5 × $2.00');
  });

  describe('package settings', () => {
    it('saves the rates, keeping what is not sent', () => {
      expect(travelSettings({})).toEqual({});
      expect(travelSettings({ travel_fee_enabled: true, travel_free_miles: 15, travel_per_mile: 2 })).toEqual({
        travel_fee_enabled: true,
        travel_free_miles: 15,
        travel_per_mile: 2,
        travel_base_fee: null,
        travel_round_trip: false,
      });
      // only the round trip changed: the rest stays as saved
      expect(travelSettings({ travel_round_trip: true }, { travel_fee_enabled: true, travel_free_miles: 10, travel_per_mile: '1.50', travel_base_fee: '25.00' })).toEqual({
        travel_fee_enabled: true,
        travel_free_miles: 10,
        travel_per_mile: 1.5,
        travel_base_fee: 25,
        travel_round_trip: true,
      });
      // turned off: the rates are kept for next time
      expect(travelSettings({ travel_fee_enabled: false }, { travel_fee_enabled: true, travel_per_mile: '2.00' })).toMatchObject({ travel_fee_enabled: false, travel_per_mile: 2 });
    });

    it('checks the limits', () => {
      const bad = (s: object) => () => travelSettings({ travel_fee_enabled: true, travel_per_mile: 1, ...s });
      expect(bad({ travel_free_miles: -1 })).toThrow(TravelSettingsError);
      expect(bad({ travel_free_miles: 2.5 })).toThrow('Free miles must be a whole number from 0 to 250.');
      expect(bad({ travel_free_miles: 251 })).toThrow(/0 to 250/);
      expect(bad({ travel_per_mile: 51 })).toThrow('The price per mile can be up to $50.');
      expect(bad({ travel_base_fee: 1000.01 })).toThrow('The base travel fee can be up to $1,000.');
      expect(bad({ travel_per_mile: 0 })).toThrow('Set a price per mile or a base fee, or turn the travel fee off.');
      expect(bad({ travel_per_mile: 0, travel_base_fee: 30 })).not.toThrow();
    });
  });
});
