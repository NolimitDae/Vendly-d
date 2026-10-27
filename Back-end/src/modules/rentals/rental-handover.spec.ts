import { handoverOptions, handoverProblem, isPickup } from './rental-handover';

const both = { title: 'Tent', offers_delivery: true, offers_pickup: true };
const deliveredOnly = { title: 'Dance floor', offers_delivery: true, offers_pickup: false };
const pickupOnly = { title: 'Speaker', offers_delivery: false, offers_pickup: true };

describe('rental handover', () => {
  it('offers only what every item allows', () => {
    expect(handoverOptions([both])).toEqual({ delivery: true, pickup: true });
    expect(handoverOptions([both, deliveredOnly])).toEqual({ delivery: true, pickup: false });
    expect(handoverOptions([pickupOnly, deliveredOnly])).toEqual({ delivery: false, pickup: false });
  });

  it('reads an older app’s request as before: no address means a pickup', () => {
    expect(isPickup(undefined, '')).toBe(true);
    expect(isPickup(undefined, '  ')).toBe(true);
    expect(isPickup(undefined, '12 Main St')).toBe(false);
    expect(isPickup(true, '12 Main St')).toBe(true);
    expect(isPickup(false, '')).toBe(false);
  });

  it('needs an address for delivery, and refuses what an item does not offer', () => {
    expect(handoverProblem([both], false, '12 Main St')).toBeNull();
    expect(handoverProblem([both], false, ' ')).toBe('Enter the delivery address.');
    expect(handoverProblem([both], true, null)).toBeNull();
    expect(handoverProblem([both, deliveredOnly], true, null)).toMatch(/^Dance floor is delivered by the vendor/);
    expect(handoverProblem([pickupOnly], false, '12 Main St')).toMatch(/^Speaker is pickup only/);
  });
});
