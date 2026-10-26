/**
 * Package customizations: a vendor adds dropdowns to a package ("Style": Knotless, Miracle knots…),
 * each one "pick one" or "pick up to N", optional or required, with an optional upcharge per option.
 * An upcharge is flat (added once) or per unit (times the package quantity: guests, hours or days).
 *
 * Pure functions, so the vendor form rules, the customer's choices and the price all come from one place.
 * The upcharges join the booking price like add-ons do (Schedule A, charges, fee, refunds, payout).
 */
import { PackageUnit, PricingError, round2 } from './pricing';

export type OptionPriceMode = 'FLAT' | 'PER_UNIT';

export const MAX_OPTION_GROUPS = 10;
export const MAX_OPTIONS_PER_GROUP = 30;
export const MAX_GROUP_TITLE = 60;
export const MAX_OPTION_LABEL = 80;
export const MAX_OPTION_PRICE = 100000;

/** A customization as the vendor sends it (ids keep existing ones; new ones have none). */
export interface OptionGroupInput {
  id?: string | null;
  title: string;
  required?: boolean | null;
  /** 1 (or empty) = pick one; 2 or more = pick up to this many */
  max_select?: number | null;
  options: { id?: string | null; label: string; price?: number | string | null; price_mode?: OptionPriceMode | null }[];
}

export interface CleanOption {
  id: string | null;
  label: string;
  price: number;
  price_mode: OptionPriceMode;
}

export interface CleanGroup {
  id: string | null;
  title: string;
  required: boolean;
  max_select: number;
  options: CleanOption[];
}

/** Thrown with a message the vendor can act on. */
export class OptionSetupError extends Error {}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Tidies and checks a package's customizations. Throws OptionSetupError. */
export function cleanOptionGroups(groups: OptionGroupInput[] | null | undefined): CleanGroup[] {
  const list = groups ?? [];
  if (list.length > MAX_OPTION_GROUPS) throw new OptionSetupError(`A package can have up to ${MAX_OPTION_GROUPS} customizations.`);
  const out: CleanGroup[] = [];
  for (const [gi, g] of list.entries()) {
    const title = String(g.title ?? '').trim();
    const name = title ? `“${title}”` : `Customization ${gi + 1}`;
    if (!title) throw new OptionSetupError(`Give customization ${gi + 1} a title, for example “Style”.`);
    if (title.length > MAX_GROUP_TITLE) throw new OptionSetupError(`Keep the title of ${name} to ${MAX_GROUP_TITLE} characters.`);
    if (out.some((o) => sameText(o.title, title))) throw new OptionSetupError(`Two customizations are called ${name}. Give each one its own title.`);
    const options: CleanOption[] = [];
    for (const [oi, o] of (g.options ?? []).entries()) {
      const label = String(o.label ?? '').trim();
      if (!label) throw new OptionSetupError(`Option ${oi + 1} of ${name} needs a name.`);
      if (label.length > MAX_OPTION_LABEL) throw new OptionSetupError(`Keep each option of ${name} to ${MAX_OPTION_LABEL} characters.`);
      if (options.some((x) => sameText(x.label, label))) throw new OptionSetupError(`${name} has “${label}” twice.`);
      const price = round2(Number(o.price ?? 0) || 0);
      if (!(price >= 0) || price > MAX_OPTION_PRICE) throw new OptionSetupError(`The upcharge for “${label}” must be between $0 and $${MAX_OPTION_PRICE.toLocaleString('en-US')}.`);
      options.push({ id: o.id || null, label, price, price_mode: o.price_mode === 'PER_UNIT' ? 'PER_UNIT' : 'FLAT' });
    }
    if (!options.length) throw new OptionSetupError(`Add at least one option to ${name}.`);
    if (options.length > MAX_OPTIONS_PER_GROUP) throw new OptionSetupError(`${name} can have up to ${MAX_OPTIONS_PER_GROUP} options.`);
    const max = Math.floor(Number(g.max_select ?? 1) || 1);
    if (max < 1) throw new OptionSetupError(`Choose how many options customers can pick for ${name}.`);
    if (max > 1 && max > options.length) {
      throw new OptionSetupError(`${name} lets customers pick up to ${max}, but it only has ${options.length} option${options.length === 1 ? '' : 's'}.`);
    }
    out.push({ id: g.id || null, title, required: !!g.required, max_select: max, options });
  }
  return out;
}

const UNIT_WORD: Record<Exclude<PackageUnit, 'fixed'>, [string, string, string]> = {
  person: ['person', 'guest', 'guests'],
  hour: ['hour', 'hour', 'hours'],
  day: ['day', 'day', 'days'],
};

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * How an option's upcharge reads on the package: "+$20.00", "+$5.00 / person", or "" when it's free.
 * A per unit upcharge on a flat priced package is counted once.
 */
export function optionPriceText(price: number | string | { toString(): string }, mode: OptionPriceMode, unit: PackageUnit) {
  const p = round2(Number(price ?? 0));
  if (!(p > 0)) return '';
  return mode === 'PER_UNIT' && unit !== 'fixed' ? `+${money(p)} / ${UNIT_WORD[unit][0]}` : `+${money(p)}`;
}

/** "Pick one", "Pick up to 3". */
export function selectionText(maxSelect: number) {
  return maxSelect > 1 ? `Pick up to ${maxSelect}` : 'Pick one';
}

/** A package's customization as customers see it, and as the booking is checked against. */
export interface OfferedGroup {
  id: string;
  title: string;
  required: boolean;
  max_select: number;
  options: { id: string; label: string; price: number | string | { toString(): string }; price_mode: OptionPriceMode }[];
}

/** What the customer picked for one customization. */
export interface OptionChoice {
  group_id: string;
  option_ids: string[];
}

/** The basis a per unit upcharge is counted on: the package's guests, hours or days. */
export interface UnitBasis {
  unit: PackageUnit;
  quantity: number;
}

export interface ChosenOption {
  option_id: string;
  label: string;
  price: number;
  price_mode: OptionPriceMode;
  quantity: number;
  amount: number;
  /** "", "+$20.00" or "+$600.00 ($5.00 × 120 guests)" */
  price_text: string;
}

/** One answered customization, frozen on the booking (titles, labels and prices as they were). */
export interface ChosenGroup {
  group_id: string;
  title: string;
  options: ChosenOption[];
  amount: number;
}

export const NO_LONGER_OFFERED = 'One of the customizations you picked is no longer offered. Please review your choices.';

/** The quantity a per unit upcharge is multiplied by (flat priced packages count once). */
const unitsFor = (mode: OptionPriceMode, basis: UnitBasis) => (mode === 'PER_UNIT' && basis.unit !== 'fixed' ? basis.quantity : 1);

function chosenPriceText(price: number, quantity: number, amount: number, mode: OptionPriceMode, basis: UnitBasis) {
  if (!(amount > 0)) return '';
  if (mode !== 'PER_UNIT' || basis.unit === 'fixed') return `+${money(amount)}`;
  const [, one, many] = UNIT_WORD[basis.unit];
  return `+${money(amount)} (${money(price)} × ${quantity} ${quantity === 1 ? one : many})`;
}

/**
 * Checks the customer's choices against the package and prices them. Every required customization must
 * be answered, ids must be the package's own, and no more than its limit may be picked. Lines come back
 * in the vendor's order, whatever order they were sent in. Throws PricingError with a customer message.
 */
export function priceOptionChoices(groups: OfferedGroup[], choices: OptionChoice[] | null | undefined, basis: UnitBasis): { groups: ChosenGroup[]; amount: number } {
  const byGroup = new Map<string, string[]>();
  for (const c of choices ?? []) {
    if (!groups.some((g) => g.id === c.group_id)) throw new PricingError(NO_LONGER_OFFERED);
    if (byGroup.has(c.group_id)) throw new PricingError('Each customization can only be answered once.');
    byGroup.set(c.group_id, [...new Set(c.option_ids ?? [])]);
  }
  const out: ChosenGroup[] = [];
  for (const g of groups) {
    const ids = byGroup.get(g.id) ?? [];
    if (!ids.length) {
      if (g.required) throw new PricingError(`Choose ${g.max_select > 1 ? 'at least one option' : 'an option'} for “${g.title}”.`);
      continue;
    }
    if (ids.some((id) => !g.options.some((o) => o.id === id))) throw new PricingError(NO_LONGER_OFFERED);
    if (ids.length > g.max_select) {
      throw new PricingError(g.max_select > 1 ? `You can pick up to ${g.max_select} options for “${g.title}”.` : `Pick just one option for “${g.title}”.`);
    }
    const options = g.options
      .filter((o) => ids.includes(o.id))
      .map((o): ChosenOption => {
        const price = round2(Number(o.price ?? 0));
        const quantity = unitsFor(o.price_mode, basis);
        const amount = round2(price * quantity);
        return { option_id: o.id, label: o.label, price, price_mode: o.price_mode, quantity, amount, price_text: chosenPriceText(price, quantity, amount, o.price_mode, basis) };
      });
    out.push({ group_id: g.id, title: g.title, options, amount: round2(options.reduce((s, o) => s + o.amount, 0)) });
  }
  return { groups: out, amount: round2(out.reduce((s, g) => s + g.amount, 0)) };
}

/** "Style: Knotless, Miracle knots" for receipts, contracts and the invoice. */
export function chosenGroupText(g: Pick<ChosenGroup, 'title' | 'options'>) {
  return `${g.title}: ${g.options.map((o) => o.label).join(', ')}`;
}

/** The snapshot stored on a booking, read back safely (older bookings have none). */
export function readChosenOptions(value: unknown): ChosenGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter((g) => g && typeof g === 'object' && Array.isArray((g as ChosenGroup).options)) as ChosenGroup[];
}

/**
 * Schedule A lines for the choices: every answered customization is listed (free ones too, so the
 * contract records what was agreed), with its upcharge when there is one.
 */
export function optionScheduleLines(groups: ChosenGroup[]) {
  return groups.map((g) => {
    const priced = g.options.filter((o) => o.amount > 0);
    // one flat upcharge says nothing the amount doesn't; several, or a per unit one, are spelled out
    const spell = priced.length > 1 || priced.some((o) => o.quantity !== 1);
    const detail = spell ? ` (${priced.map((o) => `${o.label} ${o.price_text}`).join('; ')})` : '';
    return { label: `${chosenGroupText(g)}${detail}`, amount: g.amount };
  });
}
