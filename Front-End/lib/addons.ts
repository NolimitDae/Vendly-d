import type { AddOnUnit } from "@/service/add-ons/add-ons.service";

export const money = (n: number | string) => "$" + Number(n).toFixed(2);

/** How an add-on or fee is priced, as a vendor picks it. */
export const ADD_ON_UNITS: { value: AddOnUnit; label: string }[] = [
  { value: "FIXED", label: "One price" },
  { value: "PER_PERSON", label: "Per person" },
  { value: "PER_HOUR", label: "Per hour" },
  { value: "PER_ITEM", label: "Each (customer picks how many)" },
];

/** The same price text the server builds: "$50.00 per hour". */
export function addOnPriceText(price: number | string, unit: AddOnUnit) {
  const p = money(price || 0);
  return unit === "PER_PERSON" ? `${p} per person` : unit === "PER_HOUR" ? `${p} per hour` : unit === "PER_ITEM" ? `${p} each` : p;
}

type PackageUnit = "person" | "hour" | "day";

/** Package price units that are counted out (guests, hours, days). */
export function perUnit(unit?: string | null): PackageUnit | null {
  return unit === "person" || unit === "hour" || unit === "day" ? unit : null;
}

const NOUN: Record<PackageUnit, [string, string]> = {
  person: ["guest", "guests"],
  hour: ["hour", "hours"],
  day: ["day", "days"],
};

export const quantityNoun = (unit: PackageUnit, n: number) => (n === 1 ? NOUN[unit][0] : NOUN[unit][1]);

/** "50–300 guests", "at least 2 hours", "up to 3 days", or null. */
export function quantityRangeText(unit?: string | null, min?: number | null, max?: number | null) {
  const u = perUnit(unit);
  if (!u) return null;
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo && hi) return `${lo}–${hi} ${NOUN[u][1]}`;
  if (lo) return `at least ${lo} ${quantityNoun(u, lo)}`;
  if (hi) return `up to ${hi} ${quantityNoun(u, hi)}`;
  return null;
}

/** "$45.00 / person" for counted packages, or the plain price ("event" and "fixed" are flat). */
export function packagePriceText(price: number | string, unit?: string | null) {
  const u = perUnit(unit);
  return u ? `${money(price)} / ${u}` : money(price);
}

/** Label for the price input on the package form: "$45 per person". */
export function packagePriceHint(price: string, unit?: string | null) {
  const u = perUnit(unit);
  if (!price || !(Number(price) > 0)) return null;
  const p = "$" + (Number(price) % 1 === 0 ? Number(price).toFixed(0) : Number(price).toFixed(2));
  return u ? `${p} per ${u}` : `${p} for the booking`;
}

/** Time an add-on can add to a booking, in minutes: +30m, +1h … +6h. */
export const EXTEND_CHOICES = [30, 60, 120, 180, 240, 300, 360] as const;

/** "+30m", "+1h", "+1h 30m" for the chips. */
export const extendChip = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `+${h ? `${h}h` : ""}${h && m ? " " : ""}${m ? `${m}m` : ""}`;
};

/** "30 minutes", "2 hours", "1 hour 30 minutes". */
export function durationText(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ") || "0 minutes";
}
