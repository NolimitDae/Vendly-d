/**
 * Booking prices for packages sold by the person, hour or day, plus the add-ons a customer picks.
 * Pure functions, so the apps' estimates and the server's charge come from the same rules.
 *
 * - person: price × guests (the package's minimum and maximum guests are enforced)
 * - hour:   price × event hours, counted in half hours, at least the package minimum
 * - day:    price × days the event spans (at least one)
 * - fixed / event: the price as listed
 *
 * Add-ons: FIXED once, PER_PERSON × guests, PER_HOUR × event hours, PER_ITEM × the quantity picked.
 */

export type PackageUnit = 'fixed' | 'person' | 'hour' | 'day';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Listing price units as stored ("event" and anything unknown are a flat price). */
export function packageUnit(u?: string | null): PackageUnit {
  return u === 'person' || u === 'hour' || u === 'day' ? u : 'fixed';
}

/** Event length in hours, rounded up to the half hour; null without a valid end time. */
export function eventHours(start?: Date | string | null, end?: Date | string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!(ms > 0)) return null;
  return Math.ceil((ms / HOUR) * 2) / 2;
}

/** Days an event runs (at least one). */
export function eventDayCount(start?: Date | string | null, end?: Date | string | null): number {
  if (!start || !end) return 1;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? Math.max(1, Math.ceil(ms / DAY)) : 1;
}

export class PricingError extends Error {}

export interface PackageInput {
  price: number | string | { toString(): string };
  price_unit?: string | null;
  min_quantity?: number | null;
  max_quantity?: number | null;
}

export interface EventInput {
  guest_count?: number | null;
  event_start_at?: Date | string | null;
  event_end_at?: Date | string | null;
}

export interface PackageLine {
  unit: PackageUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  /** e.g. "$45.00 per person × 120 guests" */
  label: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a package costs for an event. Throws PricingError with a customer-facing message. */
export function priceForPackage(pkg: PackageInput, ev: EventInput): PackageLine {
  const unit = packageUnit(pkg.price_unit);
  const unitPrice = round2(Number(pkg.price ?? 0));
  const min = pkg.min_quantity && pkg.min_quantity > 0 ? pkg.min_quantity : null;
  const max = pkg.max_quantity && pkg.max_quantity > 0 ? pkg.max_quantity : null;

  if (unit === 'person') {
    const guests = Number(ev.guest_count ?? 0);
    if (!(guests >= 1)) throw new PricingError('Enter how many guests are coming. This package is priced per person.');
    if (min && guests < min) throw new PricingError(`This package is for at least ${plural(min, 'guest')}.`);
    if (max && guests > max) throw new PricingError(`This package is for up to ${plural(max, 'guest')}. Message the vendor about a bigger event.`);
    return { unit, unit_price: unitPrice, quantity: guests, amount: round2(unitPrice * guests), label: `${money(unitPrice)} per person × ${plural(guests, 'guest')}` };
  }
  if (unit === 'hour') {
    const hours = eventHours(ev.event_start_at, ev.event_end_at);
    if (hours == null) throw new PricingError('Add an end time. This package is priced by the hour.');
    if (max && hours > max) throw new PricingError(`This package can be booked for up to ${plural(max, 'hour')}.`);
    // shorter bookings are charged the minimum
    const billed = min && hours < min ? min : hours;
    const note = billed > hours ? ` (${plural(min!, 'hour')} minimum)` : '';
    return { unit, unit_price: unitPrice, quantity: billed, amount: round2(unitPrice * billed), label: `${money(unitPrice)} per hour × ${plural(billed, 'hour')}${note}` };
  }
  if (unit === 'day') {
    const days = eventDayCount(ev.event_start_at, ev.event_end_at);
    if (max && days > max) throw new PricingError(`This package can be booked for up to ${plural(max, 'day')}.`);
    const billed = min && days < min ? min : days;
    const note = billed > days ? ` (${plural(min!, 'day')} minimum)` : '';
    return { unit, unit_price: unitPrice, quantity: billed, amount: round2(unitPrice * billed), label: `${money(unitPrice)} per day × ${plural(billed, 'day')}${note}` };
  }
  return { unit, unit_price: unitPrice, quantity: 1, amount: unitPrice, label: money(unitPrice) };
}

export type AddOnUnit = 'FIXED' | 'PER_PERSON' | 'PER_HOUR' | 'PER_ITEM';

export interface AddOnInput {
  id: string;
  name: string;
  price: number | string | { toString(): string };
  price_unit: AddOnUnit;
  max_quantity?: number | null;
}

export interface AddOnLine {
  add_on_id: string;
  name: string;
  price_unit: AddOnUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  label: string;
}

/** Quantity an add-on is charged for. `picked` is only used for PER_ITEM (and must be 1..max). */
export function addOnQuantity(a: Pick<AddOnInput, 'name' | 'price_unit' | 'max_quantity'>, ev: EventInput, picked?: number | null): number {
  switch (a.price_unit) {
    case 'PER_PERSON': {
      const guests = Number(ev.guest_count ?? 0);
      if (!(guests >= 1)) throw new PricingError(`Enter how many guests are coming. “${a.name}” is priced per person.`);
      return guests;
    }
    case 'PER_HOUR': {
      const hours = eventHours(ev.event_start_at, ev.event_end_at);
      if (hours == null) throw new PricingError(`Add an end time. “${a.name}” is priced by the hour.`);
      return hours;
    }
    case 'PER_ITEM': {
      const q = Math.floor(Number(picked ?? 1));
      if (!(q >= 1)) throw new PricingError(`Choose how many of “${a.name}” you want.`);
      if (a.max_quantity && q > a.max_quantity) throw new PricingError(`You can add up to ${a.max_quantity} of “${a.name}”.`);
      return q;
    }
    default:
      return 1;
  }
}

const UNIT_WORD: Record<AddOnUnit, [string, string]> = {
  FIXED: ['', ''],
  PER_PERSON: ['guest', 'guests'],
  PER_HOUR: ['hour', 'hours'],
  PER_ITEM: ['', ''],
};

/** "Bartender: $150.00 × 4 hours" style label for an add-on line. */
export function addOnLabel(name: string, unit: AddOnUnit, unitPrice: number, quantity: number) {
  if (unit === 'FIXED') return name;
  if (unit === 'PER_ITEM') return quantity === 1 ? name : `${name} × ${quantity}`;
  const [one, many] = UNIT_WORD[unit];
  return `${name}: ${money(unitPrice)} × ${quantity} ${quantity === 1 ? one : many}`;
}

export function priceAddOn(a: AddOnInput, ev: EventInput, picked?: number | null): AddOnLine {
  const unitPrice = round2(Number(a.price ?? 0));
  const quantity = addOnQuantity(a, ev, picked);
  return {
    add_on_id: a.id,
    name: a.name,
    price_unit: a.price_unit,
    unit_price: unitPrice,
    quantity,
    amount: round2(unitPrice * quantity),
    label: addOnLabel(a.name, a.price_unit, unitPrice, quantity),
  };
}

/** How a vendor's add-on or fee price reads on a package: "$150.00 per hour". */
export function unitPriceText(price: number | string | { toString(): string }, unit: AddOnUnit) {
  const p = money(round2(Number(price ?? 0)));
  return unit === 'PER_PERSON' ? `${p} per person` : unit === 'PER_HOUR' ? `${p} per hour` : unit === 'PER_ITEM' ? `${p} each` : p;
}

/** Vendly Protection fee on an add-on requested after booking: the usual percentage, without the booking minimum. */
export function extraProtectionFee(amount: number, percent: number) {
  return amount > 0 ? round2((amount * percent) / 100) : 0;
}

/** "30 minutes", "1 hour", "2 hours 30 minutes": how much time an add-on adds to a booking. */
export function durationText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const mins = m ? `${m} minute${m === 1 ? '' : 's'}` : '';
  return [hours, mins].filter(Boolean).join(' ') || '0 minutes';
}
