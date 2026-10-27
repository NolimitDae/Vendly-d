"use client";

import { MAX_BASE_FEE, MAX_FREE_MILES, MAX_PER_MILE, travelExample } from "@/lib/travel-fee";

/** The package form's delivery / travel fee, as typed. */
export interface TravelFeeValue {
  enabled: boolean;
  freeMiles: string;
  perMile: string;
  baseFee: string;
  roundTrip: boolean;
}

export const emptyTravelFee = (): TravelFeeValue => ({ enabled: false, freeMiles: "", perMile: "", baseFee: "", roundTrip: false });

/** Form values from a saved package. */
export function travelFeeFrom(l: {
  travel_fee_enabled?: boolean | null;
  travel_free_miles?: number | null;
  travel_per_mile?: number | string | null;
  travel_base_fee?: number | string | null;
  travel_round_trip?: boolean | null;
}): TravelFeeValue {
  const text = (v: number | string | null | undefined) => (v == null || v === "" || Number(v) === 0 ? "" : String(Number(v)));
  return {
    enabled: !!l.travel_fee_enabled,
    freeMiles: text(l.travel_free_miles),
    perMile: text(l.travel_per_mile),
    baseFee: text(l.travel_base_fee),
    roundTrip: !!l.travel_round_trip,
  };
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const cents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Checks the travel fee; returns a message to show, or null. Nothing is checked while it's off. */
export function travelFeeError(v: TravelFeeValue): string | null {
  if (!v.enabled) return null;
  const free = num(v.freeMiles);
  const perMile = num(v.perMile);
  const base = num(v.baseFee);
  if (!Number.isInteger(free) || free < 0 || free > MAX_FREE_MILES) return `Free miles must be a whole number from 0 to ${MAX_FREE_MILES}.`;
  if (!Number.isFinite(perMile) || perMile < 0 || perMile > MAX_PER_MILE || !cents(perMile)) return `The price per mile can be from $0 to $${MAX_PER_MILE}.`;
  if (!Number.isFinite(base) || base < 0 || base > MAX_BASE_FEE || !cents(base)) return `The base travel fee can be from $0 to $${MAX_BASE_FEE.toLocaleString("en-US")}.`;
  if (perMile === 0 && base === 0) return "Set a price per mile or a base fee, or turn the travel fee off.";
  return null;
}

/**
 * Adds the travel fee to the listing form data. A new package sends it only when it's on; the edit form
 * (`clear`) always sends it, so turning it off or emptying a field saves.
 */
export function appendTravelFee(fd: FormData, v: TravelFeeValue, clear: boolean) {
  if (!v.enabled && !clear) return;
  fd.append("travel_fee_enabled", String(v.enabled));
  if (!v.enabled) return;
  fd.append("travel_free_miles", String(num(v.freeMiles)));
  fd.append("travel_per_mile", String(num(v.perMile)));
  fd.append("travel_base_fee", String(num(v.baseFee)));
  fd.append("travel_round_trip", String(v.roundTrip));
}

/** The delivery fee as JSON (rental settings): turned off, the rates are kept for next time. */
export function travelFeeBody(v: TravelFeeValue) {
  return v.enabled
    ? { travel_fee_enabled: true, travel_free_miles: num(v.freeMiles), travel_per_mile: num(v.perMile), travel_base_fee: num(v.baseFee), travel_round_trip: v.roundTrip }
    : { travel_fee_enabled: false };
}

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5";

/**
 * "Delivery / travel fee" for a package where the vendor goes to the customer: free miles, a price per
 * mile after them, an optional base fee, and one way or round trip. Vendly works out the miles per booking.
 */
export default function TravelFeeFields({ value, onChange, rentals = false }: { value: TravelFeeValue; onChange: (v: TravelFeeValue) => void; rentals?: boolean }) {
  const set = (patch: Partial<TravelFeeValue>) => onChange({ ...value, ...patch });
  const problem = travelFeeError(value);
  const example =
    value.enabled && !problem
      ? travelExample({ free_miles: num(value.freeMiles), per_mile: num(value.perMile), base_fee: num(value.baseFee), round_trip: value.roundTrip })
      : null;

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="mt-1 h-4 w-4 accent-primary" />
        <span>
          <span className="block text-sm font-medium text-gray-900 dark:text-white">{rentals ? "Charge a delivery fee" : "Charge a delivery / travel fee"}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Vendly works out the distance from your business address (set in your profile{rentals ? "" : "; without one, this package's location"}) to each customer&apos;s address: a straight line plus 20%, close to the miles by road. The fee is added to their {rentals ? "delivered orders" : "booking"}, and promo codes never discount it.
          </span>
        </span>
      </label>

      {value.enabled && (
        <div className="space-y-3 pl-7">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="travel-free-miles" className={labelCls}>Free miles</label>
              <input id="travel-free-miles" type="number" min="0" max={MAX_FREE_MILES} step="1" placeholder="0" value={value.freeMiles} onChange={(e) => set({ freeMiles: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="travel-per-mile" className={labelCls}>Price per mile</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input id="travel-per-mile" type="number" min="0" max={MAX_PER_MILE} step="0.01" placeholder="0.00" value={value.perMile} onChange={(e) => set({ perMile: e.target.value })} className={`${inputCls} pl-7`} />
              </div>
            </div>
            <div>
              <label htmlFor="travel-base-fee" className={labelCls}>Base fee (optional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input id="travel-base-fee" type="number" min="0" max={MAX_BASE_FEE} step="0.01" placeholder="0.00" value={value.baseFee} onChange={(e) => set({ baseFee: e.target.value })} className={`${inputCls} pl-7`} />
              </div>
            </div>
          </div>
          <fieldset>
            <legend className={labelCls}>Count the miles</legend>
            <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input type="radio" name="travel-trip" checked={!value.roundTrip} onChange={() => set({ roundTrip: false })} className="accent-primary" /> One way
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="travel-trip" checked={value.roundTrip} onChange={() => set({ roundTrip: true })} className="accent-primary" /> Round trip (there and back)
              </label>
            </div>
          </fieldset>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The first free miles cost nothing, then each mile is charged at your price. The base fee is added to every {rentals ? "delivered order" : "booking with an address"}.
          </p>
          {problem ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{problem}</p>
          ) : (
            example && <p className="text-sm rounded-xl bg-primary/5 px-3 py-2 text-gray-700 dark:text-gray-300" data-testid="travel-example">{example}</p>
          )}
        </div>
      )}
    </div>
  );
}
