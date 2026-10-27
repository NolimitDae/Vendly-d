/**
 * How a rental reaches the customer: the vendor delivers it to an address, or the customer picks it up
 * from the vendor (whose address is shown once the rental is accepted). Each item says which it offers.
 */

export interface HandoverItem {
  title: string;
  offers_delivery: boolean;
  offers_pickup: boolean;
}

/** What every item in the booking offers: the customer can only choose what all of them allow. */
export function handoverOptions(items: HandoverItem[]) {
  return { delivery: items.every((i) => i.offers_delivery), pickup: items.every((i) => i.offers_pickup) };
}

/**
 * Whether the customer is picking up. Older apps don't say: no address then means a pickup, as it did
 * before. Otherwise their choice.
 */
export function isPickup(customerComes: boolean | undefined | null, address: string | undefined | null): boolean {
  return customerComes ?? !address?.trim();
}

/** Why the chosen handover can't be used for these items, or null. */
export function handoverProblem(items: HandoverItem[], pickup: boolean, address: string | undefined | null): string | null {
  if (pickup) {
    const deliveredOnly = items.find((i) => !i.offers_pickup);
    return deliveredOnly ? `${deliveredOnly.title} is delivered by the vendor, not picked up. Choose delivery and enter the address.` : null;
  }
  const pickupOnly = items.find((i) => !i.offers_delivery);
  if (pickupOnly) return `${pickupOnly.title} is pickup only. Choose pickup (or leave the delivery address empty), or rent it separately.`;
  return address?.trim() ? null : 'Enter the delivery address.';
}

/** A vendor has to offer at least one way to get the item. */
export const NO_HANDOVER = 'Offer delivery, pickup, or both.';
