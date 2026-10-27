import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TravelFeeFields, { appendTravelFee, emptyTravelFee, travelFeeError, travelFeeFrom, type TravelFeeValue } from './TravelFeeFields';
import { distanceText, feeForMiles, travelExample } from '@/lib/travel-fee';

const sent = (v: TravelFeeValue, clear: boolean) => {
  const fd = new FormData();
  appendTravelFee(fd, v, clear);
  return Object.fromEntries(fd.entries());
};
const on = (over: Partial<TravelFeeValue> = {}): TravelFeeValue => ({ enabled: true, freeMiles: '15', perMile: '2', baseFee: '', roundTrip: false, ...over });

describe('travel fee form section', () => {
  it('sends the settings when on, nothing for a new package when off, and turns it off on edit', () => {
    expect(sent(on(), false)).toEqual({ travel_fee_enabled: 'true', travel_free_miles: '15', travel_per_mile: '2', travel_base_fee: '0', travel_round_trip: 'false' });
    expect(sent(emptyTravelFee(), false)).toEqual({});
    expect(sent({ ...on(), enabled: false }, true)).toEqual({ travel_fee_enabled: 'false' });
  });

  it('reads a saved package', () => {
    expect(travelFeeFrom({ travel_fee_enabled: true, travel_free_miles: 10, travel_per_mile: '1.5', travel_base_fee: '25.00', travel_round_trip: true })).toEqual({
      enabled: true,
      freeMiles: '10',
      perMile: '1.5',
      baseFee: '25',
      roundTrip: true,
    });
    expect(travelFeeFrom({})).toEqual(emptyTravelFee());
  });

  it('checks the limits', () => {
    expect(travelFeeError(emptyTravelFee())).toBeNull();
    expect(travelFeeError(on({ freeMiles: '2.5' }))).toMatch(/whole number from 0 to 250/);
    expect(travelFeeError(on({ freeMiles: '300' }))).toMatch(/0 to 250/);
    expect(travelFeeError(on({ perMile: '51' }))).toBe('The price per mile can be from $0 to $50.');
    expect(travelFeeError(on({ perMile: '1.234' }))).toBe('The price per mile can be from $0 to $50.');
    expect(travelFeeError(on({ baseFee: '1001' }))).toBe('The base travel fee can be from $0 to $1,000.');
    expect(travelFeeError(on({ perMile: '' }))).toBe('Set a price per mile or a base fee, or turn the travel fee off.');
    expect(travelFeeError(on({ perMile: '', baseFee: '30' }))).toBeNull();
  });

  it('works out an example the way the server does', () => {
    expect(feeForMiles({ free_miles: 15, per_mile: 2, base_fee: 0, round_trip: true }, 25)).toEqual({ miles: 50, chargeable: 35, fee: 70 });
    expect(travelExample({ free_miles: 15, per_mile: 2, base_fee: 0, round_trip: false })).toBe('A customer 25 miles away pays $20.00 (25 miles, 15 free, then $2.00 a mile).');
    expect(travelExample({ free_miles: 10, per_mile: 1.5, base_fee: 25, round_trip: true })).toBe(
      'A customer 25 miles away pays $85.00 (50 miles there and back, 10 free, then $1.50 a mile, plus $25.00).',
    );
    expect(distanceText({ one_way_miles: 30, miles: 60, terms: { free_miles: 0, per_mile: 1, base_fee: 0, round_trip: true } })).toBe('About 30.0 miles away (60.0 miles there and back)');
    expect(distanceText({ one_way_miles: null, miles: null, terms: { free_miles: 0, per_mile: 1, base_fee: 0, round_trip: false } })).toBeNull();
  });

  it('turns on, shows the worked example, and updates it as the vendor types', async () => {
    function Harness() {
      const [v, setV] = useState<TravelFeeValue>(emptyTravelFee());
      return <TravelFeeFields value={v} onChange={setV} />;
    }
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByLabelText('Price per mile')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /charge a delivery \/ travel fee/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Set a price per mile or a base fee');
    await user.type(screen.getByLabelText('Free miles'), '15');
    await user.type(screen.getByLabelText('Price per mile'), '2');
    expect(screen.getByTestId('travel-example')).toHaveTextContent('A customer 25 miles away pays $20.00');
    await user.click(screen.getByRole('radio', { name: /round trip/i }));
    expect(screen.getByTestId('travel-example')).toHaveTextContent('pays $70.00 (50 miles there and back');
  });
});
