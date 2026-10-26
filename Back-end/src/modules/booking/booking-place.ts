/**
 * What a booking request asks the customer for, by package: a venue is booked for its own place, so
 * customers aren't asked where the service happens, but they are asked how many guests are coming.
 * The listing carries these as flags (needs_service_address, needs_guest_count) so the apps don't
 * need to know category names.
 */

/** The seeded category for venues (service_categories.name). */
export const VENUES_CATEGORY = 'Venues';

export interface PlaceRulesListing {
  service_at?: string | null;
  category?: { name?: string | null } | null;
}

export function isVenuePackage(listing: PlaceRulesListing | null | undefined): boolean {
  return listing?.category?.name?.trim().toLowerCase() === VENUES_CATEGORY.toLowerCase();
}

/** Whether the customer gives a service address: not for venues, nor for packages at the vendor's place. */
export function needsServiceAddress(listing: PlaceRulesListing | null | undefined): boolean {
  return listing?.service_at !== 'VENDOR_LOCATION' && !isVenuePackage(listing);
}

/** Whether a guest count is required to book (venues). Other packages ask for it only when priced per person. */
export function needsGuestCount(listing: PlaceRulesListing | null | undefined): boolean {
  return isVenuePackage(listing);
}

/** The flags the apps read on a listing. */
export function bookingNeeds(listing: PlaceRulesListing | null | undefined) {
  return { needs_service_address: needsServiceAddress(listing), needs_guest_count: needsGuestCount(listing) };
}

export const GUEST_COUNT_NEEDED = 'Enter how many guests are coming. The venue needs a guest count to take the booking.';

/**
 * The contract's venue line for a package at the vendor's own place, before anyone has accepted: only
 * the package's public, town-level location. The vendor's full address stays private until they accept
 * (the booking page shows it from then on), and the contract is signed before that, so it never has it.
 */
export function vendorPlaceVenueText(location?: string | null): string {
  const town = location?.trim();
  return town
    ? `At the Vendor's place in ${town}. The full address is shared through Vendly once the booking is accepted.`
    : "At the Vendor's place. The full address is shared through Vendly once the booking is accepted.";
}
