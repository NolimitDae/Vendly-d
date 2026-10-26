/**
 * Package customizations ("Style": Knotless, Miracle knots…) and dos and don'ts. Limits and texts
 * match the server (Back-end/src/modules/add-ons/package-options.ts); the server checks and prices
 * every choice again, so these only help the forms.
 */

export type OptionPriceMode = "FLAT" | "PER_UNIT";

export const MAX_OPTION_GROUPS = 10;
export const MAX_OPTIONS_PER_GROUP = 30;
export const MAX_GROUP_TITLE = 60;
export const MAX_OPTION_LABEL = 80;
export const MAX_OPTION_PRICE = 100000;
export const MAX_DOS = 15;
export const MAX_DO_LENGTH = 200;

/** One choice in a package customization, as the API sends it. */
export interface CustomizationOption {
  id: string;
  label: string;
  price: number;
  price_mode: OptionPriceMode;
  /** "+$20.00", "+$5.00 / person" or "" */
  price_text: string;
}

/** A package customization, as the API sends it. */
export interface Customization {
  id: string;
  title: string;
  required: boolean;
  /** 1 = pick one; more = pick up to this many */
  max_select: number;
  selection_text?: string;
  options: CustomizationOption[];
}

/** What was chosen on a booking, frozen when it was made. */
export interface ChosenCustomization {
  group_id: string;
  title: string;
  amount: number;
  options: { option_id: string; label: string; price: number; price_mode: OptionPriceMode; quantity: number; amount: number; price_text: string }[];
}

const money = (n: number) => "$" + n.toFixed(2);
const UNIT: Record<string, string> = { person: "person", hour: "hour", day: "day" };

/** The same text the server builds: "+$20.00", "+$5.00 / person", or "" when free. */
export function optionPriceText(price: number | string, mode: OptionPriceMode, priceUnit?: string | null) {
  const p = Math.round(Number(price || 0) * 100) / 100;
  if (!(p > 0)) return "";
  const unit = priceUnit ? UNIT[priceUnit] : undefined;
  return mode === "PER_UNIT" && unit ? `+${money(p)} / ${unit}` : `+${money(p)}`;
}

/** "Pick one", "Pick up to 3". */
export const selectionText = (max: number) => (max > 1 ? `Pick up to ${max}` : "Pick one");

/** "Style: Knotless, Miracle knots". */
export const chosenText = (g: Pick<ChosenCustomization, "title" | "options">) => `${g.title}: ${g.options.map((o) => o.label).join(", ")}`;

// ─── Vendor form ─────────────────────────────────────────────────────────────

let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface OptionDraft {
  key: string;
  id?: string;
  label: string;
  price: string;
  price_mode: OptionPriceMode;
}

export interface CustomizationDraft {
  key: string;
  id?: string;
  title: string;
  required: boolean;
  /** false = pick one; true = pick up to `max` */
  multi: boolean;
  max: string;
  options: OptionDraft[];
}

export const newOption = (): OptionDraft => ({ key: key(), label: "", price: "", price_mode: "FLAT" });
export const newCustomization = (): CustomizationDraft => ({ key: key(), title: "", required: false, multi: false, max: "2", options: [newOption(), newOption()] });

/** Form drafts from a saved package's customizations. */
export function draftsFrom(groups: Customization[] | null | undefined): CustomizationDraft[] {
  return (groups ?? []).map((g) => ({
    key: key(),
    id: g.id,
    title: g.title,
    required: g.required,
    multi: g.max_select > 1,
    max: String(g.max_select > 1 ? g.max_select : 2),
    options: g.options.map((o) => ({ key: key(), id: o.id, label: o.label, price: o.price ? String(o.price) : "", price_mode: o.price_mode })),
  }));
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Checks the vendor's customizations like the server does; a message to show, or null. */
export function customizationsError(drafts: CustomizationDraft[]): string | null {
  if (drafts.length > MAX_OPTION_GROUPS) return `A package can have up to ${MAX_OPTION_GROUPS} customizations.`;
  for (const [i, g] of drafts.entries()) {
    const title = g.title.trim();
    if (!title) return `Give customization ${i + 1} a title, for example “Style”.`;
    if (title.length > MAX_GROUP_TITLE) return `Keep the title of “${title}” to ${MAX_GROUP_TITLE} characters.`;
    if (drafts.slice(0, i).some((o) => same(o.title, title))) return `Two customizations are called “${title}”. Give each one its own title.`;
    const options = g.options.filter((o) => o.label.trim() || o.price);
    if (!options.length) return `Add at least one option to “${title}”.`;
    if (options.length > MAX_OPTIONS_PER_GROUP) return `“${title}” can have up to ${MAX_OPTIONS_PER_GROUP} options.`;
    for (const [j, o] of options.entries()) {
      const label = o.label.trim();
      if (!label) return `Option ${j + 1} of “${title}” needs a name.`;
      if (label.length > MAX_OPTION_LABEL) return `Keep each option of “${title}” to ${MAX_OPTION_LABEL} characters.`;
      if (options.slice(0, j).some((x) => same(x.label, label))) return `“${title}” has “${label}” twice.`;
      const p = o.price ? Number(o.price) : 0;
      if (!(p >= 0) || p > MAX_OPTION_PRICE) return `The upcharge for “${label}” must be between $0 and $${MAX_OPTION_PRICE.toLocaleString("en-US")}.`;
    }
    if (g.multi) {
      const n = Number(g.max);
      if (!Number.isInteger(n) || n < 2) return `Customers pick up to how many for “${title}”? Use 2 or more, or choose “Pick one”.`;
      if (n > options.length) return `“${title}” lets customers pick up to ${n}, but it only has ${options.length} option${options.length === 1 ? "" : "s"}.`;
    }
  }
  return null;
}

/** The body for PUT /vendor/listings/:id/customizations. Per unit upcharges need a package priced per person, hour or day. */
export function draftsToInput(drafts: CustomizationDraft[], counted: boolean) {
  return drafts.map((g) => ({
    ...(g.id ? { id: g.id } : {}),
    title: g.title.trim(),
    required: g.required,
    max_select: g.multi ? Number(g.max) : 1,
    options: g.options
      .filter((o) => o.label.trim())
      .map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        label: o.label.trim(),
        price: o.price ? Number(o.price) : 0,
        price_mode: counted ? o.price_mode : ("FLAT" as const),
      })),
  }));
}

/** Moves item `i` of a list one place up (-1) or down (+1). */
export function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ─── Customer choices ────────────────────────────────────────────────────────

/** Customization id -> the option ids picked. */
export type Picks = Record<string, string[]>;

/** Pick one replaces the choice; pick up to N toggles, never past N. */
export function togglePick(picks: Picks, g: Customization, optionId: string): Picks {
  const current = picks[g.id] ?? [];
  if (g.max_select <= 1) return { ...picks, [g.id]: current[0] === optionId ? [] : [optionId] };
  if (current.includes(optionId)) return { ...picks, [g.id]: current.filter((x) => x !== optionId) };
  if (current.length >= g.max_select) return picks;
  return { ...picks, [g.id]: [...current, optionId] };
}

/** The first required customization still unanswered, as a message; or null. */
export function missingChoice(groups: Customization[] | null | undefined, picks: Picks): string | null {
  const g = (groups ?? []).find((x) => x.required && !(picks[x.id]?.length));
  return g ? `Choose ${g.max_select > 1 ? "at least one option" : "an option"} for “${g.title}”.` : null;
}

/** The choices for the booking request, in the vendor's order. */
export function choicesPayload(groups: Customization[] | null | undefined, picks: Picks) {
  return (groups ?? [])
    .filter((g) => picks[g.id]?.length)
    .map((g) => ({ group_id: g.id, option_ids: g.options.filter((o) => picks[g.id].includes(o.id)).map((o) => o.id) }));
}

// ─── Dos and don'ts ──────────────────────────────────────────────────────────

export interface DosDonts {
  dos: string[];
  donts: string[];
}

export const emptyDosDonts = (): DosDonts => ({ dos: [], donts: [] });
export const dosDontsFrom = (l: { dos?: string[] | null; donts?: string[] | null }): DosDonts => ({ dos: l.dos ?? [], donts: l.donts ?? [] });

const clean = (list: string[]) => list.map((x) => x.trim()).filter(Boolean);

/** A message to show, or null. */
export function dosDontsError(v: DosDonts): string | null {
  for (const [list, word] of [[clean(v.dos), "dos"], [clean(v.donts), "don'ts"]] as const) {
    if (list.length > MAX_DOS) return `Add up to ${MAX_DOS} ${word}.`;
    if (list.some((x) => x.length > MAX_DO_LENGTH)) return `Each line can be up to ${MAX_DO_LENGTH} characters.`;
  }
  return null;
}

/** Adds dos / donts to the form data; `clear` (edit forms) sends empty lists so old ones are removed. */
export function appendDosDonts(fd: FormData, v: DosDonts, clear: boolean) {
  const dos = clean(v.dos);
  const donts = clean(v.donts);
  if (dos.length || clear) fd.append("dos", JSON.stringify(dos));
  if (donts.length || clear) fd.append("donts", JSON.stringify(donts));
}
