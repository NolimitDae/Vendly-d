/**
 * Suggested changes to a booking request: the vendor edits the request's date, guests, add-ons and fees
 * and customizations; the customer approves (and signs) or declines. The server prices and checks
 * everything again (Back-end/src/modules/contracts/request-changes.ts); same helpers as the website's
 * Front-End/lib/request-changes.ts.
 */
import { format, parseISO } from 'date-fns';
import { choicesPayload, type ChosenCustomization, type Customization, type Picks } from './packageOptions';
import type { TravelQuote } from './travelFee';

export type AddOnUnit = 'FIXED' | 'PER_PERSON' | 'PER_HOUR' | 'PER_ITEM';

export const MAX_LINE_PRICE = 100000;
export const MAX_LINE_QUANTITY = 999;
export const MAX_NOTE = 1000;

export interface TermsLine {
  extra_id: string | null;
  add_on_id: string | null;
  kind: 'ADD_ON' | 'FEE';
  name: string;
  description: string | null;
  price_unit: AddOnUnit;
  unit_price: number;
  quantity: number;
  amount: number;
  label: string;
  usual_price: number;
}

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

export interface Comparison {
  before: RequestTerms;
  after: RequestTerms;
  changes: string[];
  note: string | null;
  promo_note: string | null;
  lines: { key: string; before: TermsLine | null; after: TermsLine | null }[];
}

export type ProposalStatus = 'WAITING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

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
  kind: 'ADD_ON' | 'FEE';
  name: string;
  description: string | null;
  price: number;
  price_unit: AddOnUnit;
}

export interface ChangesEditor {
  current: RequestTerms;
  add_ons: CatalogItem[];
  fees: CatalogItem[];
  customizations: Customization[];
  price_unit: string;
  needs_guest_count: boolean;
  from_quote: boolean;
  /** the payment plan section (older servers leave it out) */
  payment_plan?: { package_plan: string; package_plan_label: string; pay_after: boolean; min_payments: number; max_payments: number; min_payment: number };
}

export interface ChangesState {
  role: 'VENDOR' | 'CUSTOMER';
  can_suggest: boolean;
  cannot_suggest_reason: string | null;
  proposal: ProposalView | null;
  editor: ChangesEditor | null;
  consent_text: string;
}

export const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
export const dateText = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'EEE, dd MMM yyyy') : 'Not set');
export function timeText(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return 'Not set';
  return end ? `${format(parseISO(start), 'h:mm a')} – ${format(parseISO(end), 'h:mm a')}` : format(parseISO(start), 'h:mm a');
}
export const unitWord = (unit: AddOnUnit) => (unit === 'PER_PERSON' ? 'per guest' : unit === 'PER_HOUR' ? 'per hour' : 'each');

export interface ComparisonRow {
  label: string;
  before: string;
  after: string;
  strong?: boolean;
}

const scheduleText = (t: RequestTerms) =>
  t.schedule.map((s) => `${s.label}: ${money(s.amount)}${s.due_at ? ` (${dateText(s.due_at)})` : s.capture_manually ? '' : ' when accepted'}`).join('\n');

/** Every line of the before and after, in the order a booking reads. */
export function comparisonRows(c: Comparison): ComparisonRow[] {
  const { before: b, after: a } = c;
  const pkg = (t: RequestTerms) => `${money(t.package.amount)}${t.package.unit !== 'fixed' ? ` (${t.package.label})` : ''}`;
  const rows: ComparisonRow[] = [
    { label: 'Date', before: dateText(b.event_start_at ?? b.scheduled_at), after: dateText(a.event_start_at ?? a.scheduled_at) },
    { label: 'Time', before: timeText(b.event_start_at, b.event_end_at), after: timeText(a.event_start_at, a.event_end_at) },
    { label: 'Guests', before: b.guest_count != null ? String(b.guest_count) : 'Not set', after: a.guest_count != null ? String(a.guest_count) : 'Not set' },
    { label: 'Package', before: pkg(b), after: pkg(a) },
  ];
  for (const p of c.lines) {
    const line = p.after ?? p.before!;
    rows.push({
      label: `${line.kind === 'FEE' ? 'Fee' : 'Add-on'}: ${line.name}`,
      before: p.before ? `${p.before.label} · ${money(p.before.amount)}` : 'Not included',
      after: p.after ? `${p.after.label} · ${money(p.after.amount)}` : 'Removed',
    });
  }
  const groups = new Map<string, string>();
  for (const g of [...b.options, ...a.options]) groups.set(g.group_id, g.title);
  for (const [id, title] of groups) {
    const text = (g?: ChosenCustomization) => (g ? `${g.options.map((o) => o.label).join(', ')}${g.amount > 0 ? ` · +${money(g.amount)}` : ''}` : 'None');
    rows.push({ label: title, before: text(b.options.find((g) => g.group_id === id)), after: text(a.options.find((g) => g.group_id === id)) });
  }
  if (b.travel || a.travel) {
    const travel = (t: RequestTerms) => (!t.travel ? 'None' : t.travel.fee == null ? 'Not worked out' : money(t.travel.fee));
    rows.push({ label: 'Travel fee', before: travel(b), after: travel(a) });
  }
  if (b.discount > 0 || a.discount > 0) {
    const promo = (t: RequestTerms) => (t.discount > 0 ? `${t.promo_code ?? ''} -${money(t.discount)}`.trim() : 'None');
    rows.push({ label: 'Promo', before: promo(b), after: promo(a) });
  }
  rows.push(
    { label: 'Vendor price', before: money(b.price), after: money(a.price) },
    { label: 'Vendly Protection fee', before: money(b.service_fee), after: money(a.service_fee) },
    { label: 'Total', before: money(b.total), after: money(a.total), strong: true },
    { label: 'Payments', before: scheduleText(b), after: scheduleText(a) },
  );
  return rows;
}

// ─── Vendor editor ───────────────────────────────────────────────────────────

export interface DraftLine {
  key: string;
  extra_id?: string;
  add_on_id?: string;
  kind: 'ADD_ON' | 'FEE';
  name: string;
  price_unit: AddOnUnit;
  quantity: string;
  unit_price: string;
  usual_price: number;
}

export interface Draft {
  start: Date | null;
  /** the end on its own day: an event can run over several days */
  end: Date | null;
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

export const countsQuantity = (unit: AddOnUnit) => unit === 'FIXED' || unit === 'PER_ITEM';

export function draftFrom(current: RequestTerms): Draft {
  const start = current.event_start_at ?? current.scheduled_at;
  return {
    start: start ? parseISO(start) : null,
    end: current.event_end_at ? parseISO(current.event_end_at) : null,
    guests: current.guest_count != null ? String(current.guest_count) : '',
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
    note: '',
    ...(current.travel ? { travelFee: current.travel.fee != null ? String(current.travel.fee) : '' } : {}),
  };
}

export function lineFor(item: CatalogItem): DraftLine {
  return { key: nextKey(), add_on_id: item.id, kind: item.kind, name: item.name, price_unit: item.price_unit, quantity: '1', unit_price: String(item.price), usual_price: item.price };
}

/** A message for the first thing to fix, or null. */
export function draftError(d: Draft, opts: { needsGuests?: boolean; customizations?: Customization[] } = {}): string | null {
  if (d.start && d.end && d.end.getTime() === d.start.getTime()) return 'The end time must be after the start time.';
  if (d.start && d.end && !sameDay(d.start, d.end) && d.end < d.start) return 'The end date can’t be before the start date.';
  if (d.guests && !(Number.isInteger(Number(d.guests)) && Number(d.guests) >= 1)) return 'Enter the number of guests as a whole number.';
  if (opts.needsGuests && !d.guests) return 'Enter how many guests are coming. A venue is booked for a number of guests.';
  for (const l of d.lines) {
    const p = Number(l.unit_price);
    if (l.unit_price.trim() === '' || !(p >= 0) || p > MAX_LINE_PRICE) return `The price of “${l.name}” must be between $0 and $${MAX_LINE_PRICE.toLocaleString('en-US')}.`;
    if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) return `Use dollars and cents for the price of “${l.name}”.`;
    if (countsQuantity(l.price_unit)) {
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) return `The quantity of “${l.name}” must be a whole number from 1 to ${MAX_LINE_QUANTITY}.`;
    }
  }
  if (d.travelFee !== undefined && d.travelFee.trim() !== '') {
    const t = Number(d.travelFee);
    if (!(t >= 0) || t > MAX_LINE_PRICE || Math.abs(t * 100 - Math.round(t * 100)) > 1e-6) return `The travel fee must be between $0 and $${MAX_LINE_PRICE.toLocaleString('en-US')}, in dollars and cents.`;
  }
  const g = (opts.customizations ?? []).find((x) => x.required && !d.picks[x.id]?.length);
  if (g) return `Choose ${g.max_select > 1 ? 'at least one option' : 'an option'} for “${g.title}”.`;
  if (d.note.length > MAX_NOTE) return `Keep the note to ${MAX_NOTE} characters.`;
  return null;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * A new start. The end moves by the same amount, so a Friday to Sunday event stays three days (the
 * server does the same when only the start is sent).
 */
export function moveStart(d: Draft, start: Date): Draft {
  if (!d.start || !d.end || d.endEdited) return { ...d, start };
  return { ...d, start, end: new Date(d.end.getTime() + (start.getTime() - d.start.getTime())) };
}

/** The vendor sets the end themselves. */
export const setEnd = (d: Draft, end: Date): Draft => ({ ...d, end, endEdited: true });

/**
 * The body for preview and send: the date and guests only when changed (an end only when the vendor set
 * it; otherwise the server moves it with the start); lines and choices whole.
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
  const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  if (d.start && !same(d.start, initial.start)) body.event_start_at = d.start.toISOString();
  if (d.start && d.end && d.endEdited && (!same(d.end, initial.end) || body.event_start_at)) {
    // an end before the start on the same day runs past midnight
    const end = sameDay(d.start, d.end) && d.end <= d.start ? new Date(d.end.getTime() + 86400e3) : d.end;
    body.event_end_at = end.toISOString();
  }
  if (d.guests && d.guests !== initial.guests) body.guest_count = Number(d.guests);
  // the travel fee only when the vendor set it
  if (d.travelFee !== undefined && d.travelFee.trim() !== '' && d.travelFee !== initial.travelFee) body.travel_fee = Number(d.travelFee);
  if (d.note.trim()) body.note = d.note.trim();
  return body;
}
