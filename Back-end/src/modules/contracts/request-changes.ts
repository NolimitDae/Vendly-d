/**
 * Suggested changes to a booking request (owner's ask, Nov 2026: "before they accept and sign, the vendor
 * should be able to make changes to the prices and add-ons and such and then send them back to the
 * customer for review and approval").
 *
 * While a request is PENDING the vendor can suggest new terms: date and time, guest count, the add-ons
 * and fees (add, remove, change quantity, and a price per line for this booking only) and the package
 * customizations. The base package price never changes (a per person, hour or day package is counted
 * again on the new guests, hours or days at the price it was requested at). The suggestion is a new
 * contract version on the request, signed by the vendor; the customer approves it by signing (the
 * booking's terms then change and the vendor accepts as usual) or declines it (the request stands).
 *
 * State rules:
 * - One suggestion at a time. While it waits for the customer the vendor can't Accept & Sign the old
 *   terms; they can withdraw it, or decline the request.
 * - While it waits, the request's 72 hour clock is paused (it can't expire and the vendor isn't
 *   reminded). It closes like an unanswered request only if the event starts first.
 * - Once the customer approves or declines (or the vendor withdraws), the vendor has at least 48 hours
 *   from then to answer (still never past the event start): see `reopenedAt`.
 *
 * Pure functions here, so the prices and checks can be unit tested; RequestChangesService does the rest.
 */
import { addOnLabel, AddOnUnit, eventDayCount, eventHours, EventInput, PackageLine, PackageUnit, PricingError, priceForPackage, round2 } from 'src/modules/add-ons/pricing';
import { ChosenGroup, OfferedGroup } from 'src/modules/add-ons/package-options';
import { REQUEST_EXPIRY_HOURS } from 'src/modules/booking/booking-requests';

/** The most a vendor can set one add-on or fee to, per unit, for a booking. */
export const MAX_LINE_PRICE = 100000;
/** The most of one item (fixed or per item lines) a suggestion can include. */
export const MAX_LINE_QUANTITY = 999;
/** At most this many add-on and fee lines on one request. */
export const MAX_LINES = 30;
/** The whole vendor price a suggestion can come to. */
export const MAX_PROPOSAL_PRICE = 1000000;
/** Longest note to the customer. */
export const MAX_NOTE = 1000;
/** The vendor has at least this long to answer once the customer answers a suggestion. */
export const ANSWER_HOURS_AFTER_REPLY = 48;

const HOUR = 3600 * 1000;

/** Thrown with a message the vendor can act on. */
export class RequestChangeError extends Error {}

/** The kind of a line: an add-on, or a fee charged with the booking. */
export type LineKind = 'ADD_ON' | 'FEE';

/** An add-on or fee already on the request (its price frozen when it was requested). */
export interface ExistingLine {
  id: string;
  add_on_id: string | null;
  kind: LineKind;
  name: string;
  description: string | null;
  price_unit: AddOnUnit;
  unit_price: number;
  quantity: number;
  amount: number;
}

/** One of the vendor's add-ons or fees that can be added (the package's, or their library's). */
export interface CatalogItem {
  id: string;
  kind: LineKind;
  name: string;
  description: string | null;
  price: number;
  price_unit: AddOnUnit;
}

/** What the vendor sends for one line: an existing one (extra_id) or a new one (add_on_id). */
export interface LineInput {
  extra_id?: string | null;
  add_on_id?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
}

/** A priced line of the suggestion. */
export interface ProposalLine {
  /** the line already on the request, or null for one being added */
  extra_id: string | null;
  add_on_id: string | null;
  kind: LineKind;
  name: string;
  description: string | null;
  price_unit: AddOnUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  /** "Bartender: $150.00 × 4 hours" */
  label: string;
  /** the price it had before (on the request, or the vendor's list price for a new line) */
  usual_price: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** A line's label; a fixed price line taken more than once reads like an item ("Extra hour × 2"). */
export function lineLabel(name: string, unit: AddOnUnit, unitPrice: number, quantity: number) {
  return addOnLabel(name, unit === 'FIXED' && quantity !== 1 ? 'PER_ITEM' : unit, unitPrice, quantity);
}

/** Quantity a line is charged for: the guests or hours for per person / per hour lines, otherwise what the vendor set. */
function lineQuantity(name: string, unit: AddOnUnit, ev: EventInput, picked: number | null | undefined, fallback: number) {
  if (unit === 'PER_PERSON') {
    const guests = Number(ev.guest_count ?? 0);
    if (!(guests >= 1)) throw new RequestChangeError(`Enter how many guests are coming. “${name}” is priced per person.`);
    return guests;
  }
  if (unit === 'PER_HOUR') {
    const hours = eventHours(ev.event_start_at, ev.event_end_at);
    if (hours == null) throw new RequestChangeError(`Add an end time. “${name}” is priced by the hour.`);
    return hours;
  }
  const q = picked == null ? fallback : Number(picked);
  if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) throw new RequestChangeError(`The quantity of “${name}” must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`);
  return q;
}

function linePrice(name: string, sent: number | null | undefined, fallback: number) {
  const p = sent == null ? fallback : Number(sent);
  if (!Number.isFinite(p) || p < 0 || p > MAX_LINE_PRICE) {
    throw new RequestChangeError(`The price of “${name}” must be between $0 and $${MAX_LINE_PRICE.toLocaleString('en-US')}.`);
  }
  if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) throw new RequestChangeError(`Use dollars and cents for the price of “${name}”.`);
  return round2(p);
}

/**
 * Prices the add-ons and fees of a suggestion. `inputs` is the whole new list: lines on the request that
 * aren't sent are removed. A line keeps its name and unit; its price is the one the vendor sets for this
 * booking (or the one it had). Per person and per hour lines follow the (new) guests and hours.
 */
export function priceProposalLines(inputs: LineInput[] | null | undefined, existing: ExistingLine[], catalog: CatalogItem[], ev: EventInput): ProposalLine[] {
  const list = inputs ?? [];
  if (list.length > MAX_LINES) throw new RequestChangeError(`A request can have up to ${MAX_LINES} add-ons and fees.`);
  const out: ProposalLine[] = [];
  const seenExtras = new Set<string>();
  const seenAddOns = new Set<string>();
  for (const i of list) {
    if (i.extra_id) {
      const e = existing.find((x) => x.id === i.extra_id);
      if (!e) throw new RequestChangeError('One of the add-ons is no longer on this request. Please reload and try again.');
      if (seenExtras.has(e.id) || (e.add_on_id && seenAddOns.has(e.add_on_id))) throw new RequestChangeError(`“${e.name}” is listed twice.`);
      seenExtras.add(e.id);
      if (e.add_on_id) seenAddOns.add(e.add_on_id);
      const quantity = lineQuantity(e.name, e.price_unit, ev, i.quantity, e.quantity);
      const unit_price = linePrice(e.name, i.unit_price, e.unit_price);
      out.push({ extra_id: e.id, add_on_id: e.add_on_id, kind: e.kind, name: e.name, description: e.description, price_unit: e.price_unit, unit_price, quantity, amount: round2(unit_price * quantity), label: lineLabel(e.name, e.price_unit, unit_price, quantity), usual_price: e.unit_price });
      continue;
    }
    const c = i.add_on_id ? catalog.find((x) => x.id === i.add_on_id) : undefined;
    if (!c) throw new RequestChangeError('One of the add-ons or fees isn’t available any more. Please reload and try again.');
    // an add-on already on the request is changed on its own line, not added again
    if (seenAddOns.has(c.id) || existing.some((e) => e.add_on_id === c.id && list.some((x) => x.extra_id === e.id))) {
      throw new RequestChangeError(`“${c.name}” is listed twice.`);
    }
    seenAddOns.add(c.id);
    const quantity = lineQuantity(c.name, c.price_unit, ev, i.quantity, 1);
    const unit_price = linePrice(c.name, i.unit_price, round2(Number(c.price)));
    out.push({ extra_id: null, add_on_id: c.id, kind: c.kind, name: c.name, description: c.description, price_unit: c.price_unit, unit_price, quantity, amount: round2(unit_price * quantity), label: lineLabel(c.name, c.price_unit, unit_price, quantity), usual_price: round2(Number(c.price)) });
  }
  return out;
}

/** The package line as it is on the request, worked back from the booking (whose amount includes everything). */
export interface PackageTerms {
  unit: PackageUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  label: string;
}

/**
 * The package part of a request: the booking's price before the promo, less its add-ons and
 * customizations. A per person, hour or day package's unit price is that amount over the guests, hours
 * or days it was counted on (the package's minimum hours or days count, like they did when requested).
 */
export function packageOnRequest(args: { amount: number; unit: PackageUnit; quoteTitle?: string | null; minQuantity?: number | null; ev: EventInput }): PackageTerms {
  const amount = round2(Math.max(0, args.amount));
  const flat = (label: string): PackageTerms => ({ unit: 'fixed', unit_price: amount, quantity: 1, amount, label });
  if (args.quoteTitle) return flat(`Quote: ${args.quoteTitle}`);
  const qty = countedQuantity(args.unit, args.ev, args.minQuantity);
  if (args.unit === 'fixed' || !qty) return flat(money(amount));
  const unitPrice = round2(amount / qty);
  const line = priceForPackage({ price: unitPrice, price_unit: args.unit, min_quantity: args.unit === 'person' ? null : args.minQuantity }, args.ev);
  return { unit: args.unit, unit_price: unitPrice, quantity: qty, amount, label: line.label };
}

/** Guests, billed hours or billed days a package is counted on; null when they're missing. */
function countedQuantity(unit: PackageUnit, ev: EventInput, min?: number | null): number | null {
  const floor = (n: number) => (min && min > 0 && n < min ? min : n);
  if (unit === 'person') return Number(ev.guest_count ?? 0) >= 1 ? Number(ev.guest_count) : null;
  if (unit === 'hour') {
    const h = eventHours(ev.event_start_at, ev.event_end_at);
    return h == null ? null : floor(h);
  }
  if (unit === 'day') return floor(eventDayCount(ev.event_start_at, ev.event_end_at));
  return 1;
}

/**
 * The package counted again for the suggested guests, hours or days, at the unit price it was requested at
 * (the vendor can't change the package price itself). The package's minimum hours or days still bill; its
 * guest limits don't stop the vendor (they're the vendor's own). Unchanged counts keep the exact amount.
 */
export function packageForProposal(before: PackageTerms, ev: EventInput, minQuantity?: number | null): PackageTerms {
  if (before.unit === 'fixed') return before;
  let line: PackageLine;
  try {
    line = priceForPackage({ price: before.unit_price, price_unit: before.unit, min_quantity: before.unit === 'person' ? null : minQuantity }, ev);
  } catch (e) {
    if (e instanceof PricingError) throw new RequestChangeError(e.message);
    throw e;
  }
  if (line.quantity === before.quantity) return before;
  return { unit: before.unit, unit_price: before.unit_price, quantity: line.quantity, amount: line.amount, label: line.label };
}

/**
 * The package's customizations, with the options already chosen on the request kept at the price they
 * were chosen at (a later package edit doesn't reprice them); newly picked ones use today's price.
 */
export function withChosenPrices(offered: OfferedGroup[], chosen: ChosenGroup[]): OfferedGroup[] {
  const was = new Map(chosen.flatMap((g) => g.options.map((o) => [o.option_id, o] as const)));
  return offered.map((g) => ({
    ...g,
    options: g.options.map((o) => {
      const before = was.get(o.id);
      return before ? { ...o, price: before.price, price_mode: before.price_mode } : o;
    }),
  }));
}

/** The request's terms, as the comparison and the booking use them. */
export interface RequestTerms {
  scheduled_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  guest_count: number | null;
  package: PackageTerms;
  lines: ProposalLine[];
  options: ChosenGroup[];
  options_amount: number;
  promo_code: string | null;
  discount: number;
  /** vendor price, after the promo */
  price: number;
  service_fee: number;
  total: number;
  plan: string;
  schedule: { label: string; amount: number; due_at: string | null; capture_manually?: boolean }[];
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

const lineKey = (l: Pick<ProposalLine, 'extra_id' | 'add_on_id' | 'name'>) => l.extra_id ?? `new:${l.add_on_id ?? l.name}`;

/** What changed between two sets of terms, in plain words ("Date and time", "Guests: 80 to 120"). */
export function describeChanges(before: RequestTerms, after: RequestTerms): string[] {
  const out: string[] = [];
  if (iso(before.event_start_at ?? before.scheduled_at) !== iso(after.event_start_at ?? after.scheduled_at) || iso(before.event_end_at) !== iso(after.event_end_at)) {
    out.push('Date and time');
  }
  if ((before.guest_count ?? null) !== (after.guest_count ?? null)) out.push(`Guests: ${before.guest_count ?? 'not set'} to ${after.guest_count ?? 'not set'}`);
  if (before.package.amount !== after.package.amount) out.push(`Package: ${money(before.package.amount)} to ${money(after.package.amount)}`);
  const beforeLines = new Map(before.lines.map((l) => [l.extra_id ?? '', l]));
  for (const l of after.lines) {
    const was = l.extra_id ? beforeLines.get(l.extra_id) : undefined;
    const word = l.kind === 'FEE' ? 'fee' : 'add-on';
    if (!was) out.push(`New ${word}: ${l.label} (${money(l.amount)})`);
    else if (was.amount !== l.amount || was.quantity !== l.quantity || was.unit_price !== l.unit_price) out.push(`${l.name}: ${money(was.amount)} to ${money(l.amount)}`);
  }
  const kept = new Set(after.lines.map((l) => l.extra_id).filter(Boolean));
  for (const l of before.lines) if (l.extra_id && !kept.has(l.extra_id)) out.push(`Removed ${l.kind === 'FEE' ? 'fee' : 'add-on'}: ${l.name}`);
  const picks = (t: RequestTerms) => t.options.map((g) => `${g.group_id}:${g.options.map((o) => `${o.option_id}@${o.amount}`).join(',')}`).join('|');
  if (picks(before) !== picks(after)) out.push('Customizations');
  if ((before.promo_code ?? null) !== (after.promo_code ?? null)) out.push(after.promo_code ? `Promo ${after.promo_code}` : `Promo ${before.promo_code} removed`);
  return out;
}

/** True when the suggestion changes nothing the customer would see. */
export function sameTerms(before: RequestTerms, after: RequestTerms) {
  return !describeChanges(before, after).length;
}

/** For the comparison: the before and after of each add-on or fee line, matched up. */
export function pairLines(before: RequestTerms, after: RequestTerms) {
  const rows: { key: string; before: ProposalLine | null; after: ProposalLine | null }[] = [];
  const afterByExtra = new Map(after.lines.filter((l) => l.extra_id).map((l) => [l.extra_id!, l]));
  for (const b of before.lines) rows.push({ key: lineKey(b), before: b, after: (b.extra_id && afterByExtra.get(b.extra_id)) || null });
  for (const a of after.lines) if (!a.extra_id || !before.lines.some((b) => b.extra_id === a.extra_id)) rows.push({ key: lineKey(a), before: null, after: a });
  return rows;
}

/**
 * When the request's clock restarts after the customer answers a suggestion (or the vendor withdraws
 * it): the vendor keeps the 72 hours they had, and always has at least 48 hours from the answer.
 * Returned as the request's new `request_opened_at` (requestExpiresAt still caps it at the event start).
 */
export function reopenedAt(openedAt: Date, now = new Date()): Date {
  const latest = now.getTime() - (REQUEST_EXPIRY_HOURS - ANSWER_HOURS_AFTER_REPLY) * HOUR;
  return new Date(Math.max(openedAt.getTime(), latest));
}

/** A contract version that holds a suggestion (its merge data carries the suggested terms). */
export interface ProposalData {
  note: string | null;
  base_contract_id: string;
  before: RequestTerms;
  after: RequestTerms;
  changes: string[];
  promo_note: string | null;
  /** the vendor's signature sent with the changes (their contract signature comes with Accept & Sign) */
  vendor_signature?: { legal_name: string; signed_at: string; signature_image_key: string | null; document_sha256: string };
}

export function readProposal(mergeData: unknown): ProposalData | null {
  const p = (mergeData as { request_changes?: ProposalData } | null)?.request_changes;
  return p && typeof p === 'object' && p.after ? p : null;
}

export const isProposal = (c: { merge_data?: unknown }) => !!readProposal(c.merge_data);
