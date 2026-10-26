import { BadRequestException } from '@nestjs/common';
import { BookingContractsService } from 'src/modules/contracts/booking-contracts.service';
import { buildMergeData, missingFields, renderTemplate } from 'src/modules/contracts/contract-merge';
import { bookingNeeds, GUEST_COUNT_NEEDED, isVenuePackage, needsGuestCount, needsServiceAddress, vendorPlaceVenueText } from './booking-place';
import { serviceAtOf } from './booking-tracker';

const venue = { service_at: 'CUSTOMER_LOCATION', category: { name: 'Venues' } };
const dj = { service_at: 'CUSTOMER_LOCATION', category: { name: 'Music & Entertainment' } };
const salon = { service_at: 'VENDOR_LOCATION', category: { name: 'Hair & Makeup' } };

describe('what a booking request asks for', () => {
  it('venues: no service address, a guest count', () => {
    expect(isVenuePackage(venue)).toBe(true);
    expect(isVenuePackage({ category: { name: ' venues ' } })).toBe(true);
    expect(bookingNeeds(venue)).toEqual({ needs_service_address: false, needs_guest_count: true });
  });

  it("packages at the vendor's place: no service address, guests as before", () => {
    expect(bookingNeeds(salon)).toEqual({ needs_service_address: false, needs_guest_count: false });
  });

  it('everything else (and rentals with no package) asks for the address as before', () => {
    expect(bookingNeeds(dj)).toEqual({ needs_service_address: true, needs_guest_count: false });
    expect(needsServiceAddress(null)).toBe(true);
    expect(needsGuestCount(undefined)).toBe(false);
    expect(needsServiceAddress({ service_at: null })).toBe(true);
  });

  it("a venue booking happens at the vendor's place (Where to go, Customer arrived)", () => {
    expect(serviceAtOf({ listing: venue })).toBe('VENDOR_LOCATION');
    expect(serviceAtOf({ listing: dj })).toBe('CUSTOMER_LOCATION');
    expect(serviceAtOf({ listing: null })).toBe('CUSTOMER_LOCATION');
  });

  it("names the vendor's place by its town only, which fills the contract's venue", () => {
    const text = vendorPlaceVenueText('Smyrna, DE');
    expect(text).toBe("At the Vendor's place in Smyrna, DE. The full address is shared through Vendly once the booking is accepted.");
    expect(vendorPlaceVenueText(null)).toContain("At the Vendor's place.");
    const data = buildMergeData({
      booking: { id: 'b1', venue_address: text, guest_count: 80 },
      vendor: { name: 'Hall' },
      customer: { name: 'Carl' },
      contractVersion: 1,
    });
    expect(missingFields(['venue_address', 'guest_count'], data)).toEqual([]);
    expect(renderTemplate('- Venue: {{venue_address}}', data)).toBe(`- Venue: ${text}`);
  });
});

describe('a venue booking request without a guest count', () => {
  const setup = (listing: Record<string, unknown>, event: { guest_count: number | null } | null = null) => {
    const service = new BookingContractsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'loadBookingContext').mockResolvedValue({ listing: { id: 'l1', vendor_id: 'v1', location: 'Smyrna, DE', ...listing }, customer: { id: 'c1' }, event, vc: {} });
    // past the guest check the request goes on to the date check: stop there
    const dateCheck = jest.spyOn(service as any, 'assertDateOpen').mockRejectedValue(new Error('date checked'));
    return { service, dateCheck };
  };
  const dto = (extra: Record<string, unknown> = {}) => ({ listing_id: 'l1', vendor_id: 'v1', event_start_at: new Date('2026-12-05T18:00:00Z'), ...extra }) as any;

  it('is refused, for the preview and the request alike, with a clear message', async () => {
    const { service, dateCheck } = setup(venue);
    const err = await service.previewForBooking('c1', dto()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toEqual({ message: GUEST_COUNT_NEEDED, error: 'GUEST_COUNT_REQUIRED' });
    expect(dateCheck).not.toHaveBeenCalled();
    // the signed request is checked the same way, before anything is stored
    await expect((service as any).prepareForBooking('c1', dto({ guest_count: 0 }), 'b1')).rejects.toThrow(GUEST_COUNT_NEEDED);
  });

  it('goes ahead with guests, or with the planner event’s own count', async () => {
    await expect(setup(venue).service.previewForBooking('c1', dto({ guest_count: 80 }))).rejects.toThrow('date checked');
    await expect(setup(venue, { guest_count: 120 }).service.previewForBooking('c1', dto({ event_id: 'e1' }))).rejects.toThrow('date checked');
  });

  it('other categories are unchanged: no guest count needed', async () => {
    await expect(setup(dj).service.previewForBooking('c1', dto())).rejects.toThrow('date checked');
  });
});
