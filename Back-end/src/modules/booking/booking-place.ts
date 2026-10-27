/**
 * What a booking request asks the customer for, by package: a venue is booked for its own place, so
 * customers aren't asked where the service happens, but they are asked how many guests are coming (other
 * packages: when the vendor asks for it). A vendor who goes to the customer can let them come instead.
 * The listing carries these as flags (needs_service_address, needs_guest_count) so the apps don't
 * need to know category names.
 */

/** The seeded category for venues (service_categories.name). */
export const VENUES_CATEGORY = 'Venues';

export interface PlaceRulesListing {
  service_at?: string | null;
  category?: { name?: string | null } | null;
  /** the vendor goes to the customer, but lets them come to the vendor's place instead */
  customer_can_come?: boolean | null;
  /** the vendor's choice; null = the default (required for venues) */
  guest_count_required?: boolean | null;
}

export function isVenuePackage(listing: PlaceRulesListing | null | undefined): boolean {
  return listing?.category?.name?.trim().toLowerCase() === VENUES_CATEGORY.toLowerCase();
}

/** Whether the package normally happens at the customer's address: not venues, nor packages at the vendor's place. */
function atCustomerPlace(listing: PlaceRulesListing | null | undefined): boolean {
  return listing?.service_at !== 'VENDOR_LOCATION' && !isVenuePackage(listing);
}

/** Whether the customer may choose to come to the vendor instead (pickup, drop-off) on this package. */
export function canComeToVendor(listing: PlaceRulesListing | null | undefined): boolean {
  return atCustomerPlace(listing) && !!listing?.customer_can_come;
}

/**
 * Whether the customer gives a service address: not for venues, nor for packages at the vendor's place,
 * nor when the customer chose to come to the vendor (where the package allows it).
 */
export function needsServiceAddress(listing: PlaceRulesListing | null | undefined, customerComes = false): boolean {
  return atCustomerPlace(listing) && !(customerComes && canComeToVendor(listing));
}

/** Whether a guest count is required to book: the vendor's choice, else only for venues. Per person packages always count guests. */
export function needsGuestCount(listing: PlaceRulesListing | null | undefined): boolean {
  return listing?.guest_count_required ?? isVenuePackage(listing);
}

/** The flags the apps read on a listing. */
export function bookingNeeds(listing: PlaceRulesListing | null | undefined) {
  return { needs_service_address: needsServiceAddress(listing), needs_guest_count: needsGuestCount(listing), customer_can_come: canComeToVendor(listing) };
}

/** Whether this request has the customer coming to the vendor; asking for it on a package that doesn't offer it is refused. */
export function customerComesFor(listing: PlaceRulesListing | null | undefined, requested?: boolean | null): boolean {
  if (!requested) return false;
  if (!canComeToVendor(listing)) throw new CustomerCantComeError();
  return true;
}

export class CustomerCantComeError extends Error {
  constructor() {
    super('This vendor comes to you for this package. Enter the address where it happens.');
  }
}

/**
 * The contract's required booking fields for this package: the template's list, without the guest count
 * when the vendor said it isn't needed (and with it when they said it is).
 */
export function requiredBookingFields(required: string[], listing: PlaceRulesListing | null | undefined): string[] {
  if (listing?.guest_count_required === false) return required.filter((f) => f !== 'guest_count');
  if (listing?.guest_count_required === true && !required.includes('guest_count')) return [...required, 'guest_count'];
  return required;
}

export const GUEST_COUNT_NEEDED = 'Enter how many guests are coming. The vendor needs a guest count to take the booking.';

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
