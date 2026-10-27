/**
 * Suggested changes to a booking request: the vendor edits the request's date, guests, add-ons and fees
 * and customizations; the customer approves (and signs) or declines. The server prices and checks
 * everything again (Back-end/src/modules/contracts/request-changes.ts); these types and helpers only
 * drive the forms and the before / after comparison.
 */
import dayjs from "dayjs";
import type { ChosenCustomization, Customization, Picks } from "./package-options";
import { choicesPayload } from "./package-options";
import type { TravelQuote } from "./travel-fee";

export type AddOnUnit = "FIXED" | "PER_PERSON" | "PER_HOUR" | "PER_ITEM";

/** Matches the server's bounds. */
export const MAX_LINE_PRICE = 100000;
export const MAX_LINE_QUANTITY = 999;
export const MAX_NOTE = 1000;

export interface TermsLine {
  extra_id: string | null;
  add_on_id: string | null;
  kind: "ADD_ON" | "FEE";
  name: string;
  description: string | null;
  price_unit: AddOnUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  label: string;
  usual_price: number;
}

/** A request's terms, as the server works them out. */
export interface RequestTerms {
  scheduled_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  guest_count: number | null;
  package: { unit: string; unit_price: number; quantity: number; amount: number; label: string };
  lines: TermsLine[];
  options: ChosenCustomization[];
  options_amount: number;
  /** the delivery / travel fee in the price (null or missing: none applies) */
  travel?: TravelQuote | null;
  promo_code: string | null;
  discount: number;
  price: number;
  service_fee: number;
  total: number;
  plan: string;
  schedule: { label: string; amount: number; due_at: string | null; capture_manually?: boolean }[];
}

export interface LinePair {
  key: string;
  before: TermsLine | null;
  after: TermsLine | null;
}

export interface Comparison {
  before: RequestTerms;
  after: RequestTerms;
  changes: string[];
  note: string | null;
  promo_note: string | null;
  lines: LinePair[];
}

export type ProposalStatus = "WAITING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

export interface ProposalView extends Comparison {
  contract_id: string;
  version: number;
  status: ProposalStatus;
  sent_at: string;
  vendor_name: string;
  signed_by: string | null;
  /** approved, and now with the planner's client to co-sign before the vendor can accept */
  client_cosigning?: boolean;
  content_sha256: string;
}

export interface CatalogItem {
  id: string;
  kind: "ADD_ON" | "FEE";
  name: string;
  description: string | null;
  price: number;
  price_unit: AddOnUnit;
}

export interface ChangesState {
  role: "VENDOR" | "CUSTOMER";
  can_suggest: boolean;
  cannot_suggest_reason: string | null;
  proposal: ProposalView | null;
  editor: {
    current: RequestTerms;
    add_ons: CatalogItem[];
    fees: CatalogItem[];
    customizations: Customization[];
    price_unit: string;
    needs_guest_count: boolean;
    from_quote: boolean;
    /** the payment plan section (older servers leave it out) */
    payment_plan?: { package_plan: string; package_plan_label: string; pay_after: boolean; min_payments: number; max_payments: number; min_payment: number };
  } | null;
  consent_text: string;
}

export const money = (n: number | null | undefined) => "$" + Number(n ?? 0).toFixed(2);

/** "Sat, Dec 5, 2026" */
export const dateText = (iso: string | null | undefined) => (iso ? dayjs(iso).format("ddd, MMM D, YYYY") : "Not set");

/** "4:00 PM – 8:00 PM", or the start alone. */
export function timeText(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return "Not set";
  return end ? `${dayjs(start).format("h:mm A")} – ${dayjs(end).format("h:mm A")}` : dayjs(start).format("h:mm A");
}

/** How a line's unit reads next to its price box. */
export function unitWord(unit: AddOnUnit) {
  return unit === "PER_PERSON" ? "per guest" : unit === "PER_HOUR" ? "per hour" : "each";
}

// ─── Vendor editor ───────────────────────────────────────────────────────────

export interface DraftLine {
  key: string;
  extra_id?: string;
  add_on_id?: string;
  kind: "ADD_ON" | "FEE";
  name: string;
  price_unit: AddOnUnit;
  quantity: string;
  unit_price: string;
  usual_price: number;
}

export interface Draft {
  /** the start's local date and time ("2026-12-05", "16:00") */
  date: string;
  start: string;
  /** the end's own date: an event can run over several days */
  endDate: string;
  end: string;
  /** the vendor set the end themselves (otherwise it moves with the start) */
  endEdited?: boolean;
  guests: string;
  lines: DraftLine[];
  picks: Picks;
  note: string;
  /** the travel fee for this booking, when one applies ("" when it couldn't be worked out yet) */
  travelFee?: string;
}

let seq = 0;
const nextKey = () => `l${(seq++).toString(36)}`;

/** The editor, filled with the request as it is. */
export function draftFrom(current: RequestTerms): Draft {
  const start = current.event_start_at ?? current.scheduled_at;
  return {
    date: start ? dayjs(start).format("YYYY-MM-DD") : "",
    start: current.event_start_at ? dayjs(current.event_start_at).format("HH:mm") : "",
    endDate: current.event_end_at ? dayjs(current.event_end_at).format("YYYY-MM-DD") : "",
    end: current.event_end_at ? dayjs(current.event_end_at).format("HH:mm") : "",
    guests: current.guest_count != null ? String(current.guest_count) : "",
    lines: current.lines.map((l) => ({
      key: nextKey(),
      extra_id: l.extra_id ?? undefined,
      kind: l.kind,
      name: l.name,
      price_unit: l.price_unit,
      quantity: String(l.quantity),
      unit_price: String(l.unit_price),
      usual_price: l.usual_price,
    })),
    picks: Object.fromEntries(current.options.map((g) => [g.group_id, g.options.map((o) => o.option_id)])),
    note: "",
    ...(current.travel ? { travelFee: current.travel.fee != null ? String(current.travel.fee) : "" } : {}),
  };
}

/** A line for one of the vendor's add-ons or fees, at its list price. */
export function lineFor(item: CatalogItem): DraftLine {
  return { key: nextKey(), add_on_id: item.id, kind: item.kind, name: item.name, price_unit: item.price_unit, quantity: "1", unit_price: String(item.price), usual_price: item.price };
}

/** A message for the first thing to fix in the editor, or null. */
export function draftError(d: Draft, opts: { needsGuests?: boolean; customizations?: Customization[] } = {}): string | null {
  if (d.date && d.start && d.end && (d.endDate || d.date) === d.date && d.end === d.start) return "The end time must be after the start time.";
  if (d.date && d.endDate && d.endDate < d.date) return "The end date can’t be before the start date.";
  if (d.guests && !(Number.isInteger(Number(d.guests)) && Number(d.guests) >= 1)) return "Enter the number of guests as a whole number.";
  if (opts.needsGuests && !d.guests) return "Enter how many guests are coming. The vendor needs a guest count to take the booking.";
  for (const l of d.lines) {
    const p = Number(l.unit_price);
    if (l.unit_price.trim() === "" || !(p >= 0) || p > MAX_LINE_PRICE) return `The price of “${l.name}” must be between $0 and $${MAX_LINE_PRICE.toLocaleString("en-US")}.`;
    if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) return `Use dollars and cents for the price of “${l.name}”.`;
    if (countsQuantity(l.price_unit)) {
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) return `The quantity of “${l.name}” must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`;
    }
  }
  if (d.travelFee !== undefined && d.travelFee.trim() !== "") {
    const t = Number(d.travelFee);
    if (!(t >= 0) || t > MAX_LINE_PRICE || Math.abs(t * 100 - Math.round(t * 100)) > 1e-6) return `The travel fee must be between $0 and $${MAX_LINE_PRICE.toLocaleString("en-US")}, in dollars and cents.`;
  }
  const g = (opts.customizations ?? []).find((x) => x.required && !d.picks[x.id]?.length);
  if (g) return `Choose ${g.max_select > 1 ? "at least one option" : "an option"} for “${g.title}”.`;
  if (d.note.length > MAX_NOTE) return `Keep the note to ${MAX_NOTE} characters.`;
  return null;
}

/** Fixed and per item lines take a quantity; per guest and per hour lines follow the guests and hours. */
export const countsQuantity = (unit: AddOnUnit) => unit === "FIXED" || unit === "PER_ITEM";

/** A local date and time ("2026-12-05", "16:00") as an ISO string. */
function at(date: string, time: string) {
  return dayjs(`${date}T${time}`).toDate();
}

/**
 * A new start date or time. The end moves by the same amount, so a Friday to Sunday event stays three
 * days (the server does the same when only the start is sent).
 */
export function moveStart(d: Draft, date: string, start: string): Draft {
  const next = { ...d, date, start };
  if (!d.date || !date || !d.end || !d.endDate || d.endEdited) return next;
  const by = at(date, start || "00:00").getTime() - at(d.date, d.start || "00:00").getTime();
  const end = dayjs(at(d.endDate, d.end).getTime() + by);
  return { ...next, endDate: end.format("YYYY-MM-DD"), end: end.format("HH:mm") };
}

/** The vendor sets the end themselves. */
export const setEnd = (d: Draft, endDate: string, end: string): Draft => ({ ...d, endDate, end, endEdited: true });

/**
 * The request body for preview and send. Only what the vendor changed is sent for the date and guests
 * (an end only when they set it; otherwise the server moves it with the start); the add-ons and fees and
 * the customizations are always sent whole (the server checks and prices them).
 */
export function draftPayload(d: Draft, initial: Draft, customizations: Customization[]) {
  const body: Record<string, unknown> = {
    lines: d.lines.map((l) => ({
      ...(l.extra_id ? { extra_id: l.extra_id } : { add_on_id: l.add_on_id }),
      ...(countsQuantity(l.price_unit) ? { quantity: Number(l.quantity) } : {}),
      unit_price: Number(l.unit_price),
    })),
    options: choicesPayload(customizations, d.picks),
  };
  const start = d.date ? at(d.date, d.start || "00:00") : null;
  if (start && (d.date !== initial.date || d.start !== initial.start)) body.event_start_at = start.toISOString();
  if (start && d.endEdited && d.end && (d.endDate !== initial.endDate || d.end !== initial.end || body.event_start_at)) {
    const sameDay = !d.endDate || d.endDate === d.date;
    let end = at(sameDay ? d.date : d.endDate, d.end);
    // an end before the start on the same day runs past midnight
    if (sameDay && end <= start) end = dayjs(end).add(1, "day").toDate();
    body.event_end_at = end.toISOString();
  }
  if (d.guests && d.guests !== initial.guests) body.guest_count = Number(d.guests);
  // the travel fee only when the vendor set it
  if (d.travelFee !== undefined && d.travelFee.trim() !== "" && d.travelFee !== initial.travelFee) body.travel_fee = Number(d.travelFee);
  if (d.note.trim()) body.note = d.note.trim();
  return body;
}
