/**
 * Vendors whose packages and rentals customers can find and book: not suspended (status 0) and not
 * deleted. A suspended vendor can't sign in to answer a request, so their listings are hidden and
 * new requests to them refused, until an admin lifts the suspension.
 */
export const ACTIVE_VENDOR_WHERE = { deleted_at: null, OR: [{ status: null }, { status: { not: 0 } }] };

/** Shown when someone tries to book (or preview a booking with) a suspended or deleted vendor. */
export const VENDOR_UNAVAILABLE = 'This vendor isn’t taking bookings right now. Try another vendor.';

export function vendorIsActive(vendor: { status?: number | null; deleted_at?: Date | null } | null | undefined): boolean {
  return !!vendor && !vendor.deleted_at && vendor.status !== 0;
}
