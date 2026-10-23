import { addOnLabel, eventDayCount, eventHours, extraProtectionFee, packageUnit, priceAddOn, priceForPackage, PricingError, unitPriceText } from './pricing';

const start = '2026-12-05T18:00:00.000Z';
const at = (h: number) => new Date(new Date(start).getTime() + h * 3600 * 1000).toISOString();

describe('package pricing', () => {
  it('treats event and unknown units as a flat price', () => {
    expect(packageUnit('event')).toBe('fixed');
    expect(packageUnit(undefined)).toBe('fixed');
    expect(priceForPackage({ price: 500, price_unit: 'event' }, {})).toMatchObject({ amount: 500, quantity: 1, label: '$500.00' });
  });

  it('charges per person packages for every guest (catering)', () => {
    const line = priceForPackage({ price: 45, price_unit: 'person', min_quantity: 50 }, { guest_count: 120 });
    expect(line).toMatchObject({ unit: 'person', quantity: 120, amount: 5400, label: '$45.00 per person × 120 guests' });
  });

  it('needs a guest count for per person packages', () => {
    expect(() => priceForPackage({ price: 45, price_unit: 'person' }, {})).toThrow(PricingError);
  });

  it('enforces the minimum and maximum guests', () => {
    expect(() => priceForPackage({ price: 45, price_unit: 'person', min_quantity: 50 }, { guest_count: 20 })).toThrow('at least 50 guests');
    expect(() => priceForPackage({ price: 45, price_unit: 'person', max_quantity: 200 }, { guest_count: 250 })).toThrow('up to 200 guests');
  });

  it('charges hourly packages by the event length in half hours', () => {
    expect(eventHours(start, at(4.2))).toBe(4.5);
    const line = priceForPackage({ price: 100, price_unit: 'hour' }, { event_start_at: start, event_end_at: at(4.2) });
    expect(line).toMatchObject({ quantity: 4.5, amount: 450 });
  });

  it('charges the hourly minimum for a shorter booking and says so', () => {
    const line = priceForPackage({ price: 100, price_unit: 'hour', min_quantity: 3 }, { event_start_at: start, event_end_at: at(2) });
    expect(line).toMatchObject({ quantity: 3, amount: 300 });
    expect(line.label).toContain('3 hours minimum');
  });

  it('needs an end time for hourly packages', () => {
    expect(() => priceForPackage({ price: 100, price_unit: 'hour' }, { event_start_at: start })).toThrow('end time');
    expect(() => priceForPackage({ price: 100, price_unit: 'hour' }, { event_start_at: start, event_end_at: start })).toThrow('end time');
  });

  it('charges daily packages per day spanned', () => {
    expect(eventDayCount(start, at(30))).toBe(2);
    expect(eventDayCount(start, null)).toBe(1);
    expect(priceForPackage({ price: 80, price_unit: 'day' }, { event_start_at: start, event_end_at: at(49) })).toMatchObject({ quantity: 3, amount: 240 });
    expect(() => priceForPackage({ price: 80, price_unit: 'day', max_quantity: 2 }, { event_start_at: start, event_end_at: at(49) })).toThrow('up to 2 days');
  });

  it('rounds to cents', () => {
    expect(priceForPackage({ price: 12.345, price_unit: 'person' }, { guest_count: 3 }).amount).toBe(37.05);
  });
});

describe('add-on pricing', () => {
  const ev = { guest_count: 100, event_start_at: start, event_end_at: at(5) };

  it('prices each unit', () => {
    expect(priceAddOn({ id: 'a', name: 'Setup', price: 150, price_unit: 'FIXED' }, ev)).toMatchObject({ quantity: 1, amount: 150, label: 'Setup' });
    expect(priceAddOn({ id: 'a', name: 'Dessert', price: 6.5, price_unit: 'PER_PERSON' }, ev)).toMatchObject({ quantity: 100, amount: 650 });
    expect(priceAddOn({ id: 'a', name: 'Bartender', price: 40, price_unit: 'PER_HOUR' }, ev)).toMatchObject({ quantity: 5, amount: 200, label: 'Bartender: $40.00 × 5 hours' });
    expect(priceAddOn({ id: 'a', name: 'Chair', price: 4, price_unit: 'PER_ITEM', max_quantity: 200 }, ev, 50)).toMatchObject({ quantity: 50, amount: 200, label: 'Chair × 50' });
  });

  it('caps items at the vendor maximum and refuses zero', () => {
    expect(() => priceAddOn({ id: 'a', name: 'Chair', price: 4, price_unit: 'PER_ITEM', max_quantity: 10 }, ev, 11)).toThrow('up to 10');
    expect(() => priceAddOn({ id: 'a', name: 'Chair', price: 4, price_unit: 'PER_ITEM' }, ev, 0)).toThrow(PricingError);
  });

  it('needs guests or an end time when the add-on is priced that way', () => {
    expect(() => priceAddOn({ id: 'a', name: 'Dessert', price: 5, price_unit: 'PER_PERSON' }, {})).toThrow('guests');
    expect(() => priceAddOn({ id: 'a', name: 'Bartender', price: 40, price_unit: 'PER_HOUR' }, { event_start_at: start })).toThrow('end time');
  });

  it('describes prices the way customers read them', () => {
    expect(unitPriceText(45, 'PER_PERSON')).toBe('$45.00 per person');
    expect(unitPriceText(50, 'PER_HOUR')).toBe('$50.00 per hour');
    expect(unitPriceText(4, 'PER_ITEM')).toBe('$4.00 each');
    expect(addOnLabel('Late return', 'PER_HOUR', 50, 1)).toBe('Late return: $50.00 × 1 hour');
  });

  it('takes the Vendly Protection percentage on later add-ons without the booking minimum', () => {
    expect(extraProtectionFee(20, 5)).toBe(1);
    expect(extraProtectionFee(0, 5)).toBe(0);
  });
});
