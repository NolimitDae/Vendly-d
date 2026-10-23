import { EventType } from 'prisma/generated/client';

/**
 * Event planning helper: which kinds of services an event usually needs, a typical budget split and
 * how far ahead to book. Rule-based (no AI, no running cost) and pure, so it is unit-tested.
 *
 * Every rule names a Vendly service category by its seeded name
 * (prisma/migrations/20261023090000_seed_service_categories). Categories are matched by name at
 * runtime and a rule whose category no longer exists is skipped, so admins renaming or deleting a
 * category never breaks the checklist or makes it recommend something Vendly doesn't offer.
 */

export const PRIORITIES = ['ESSENTIAL', 'RECOMMENDED', 'NICE_TO_HAVE'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** How a rule turns the guest count (and its share of the budget) into a practical tip. */
export type TipKind =
  | 'per_person'
  | 'servers'
  | 'tables'
  | 'venue_capacity'
  | 'photographer'
  | 'centerpieces'
  | 'invitations'
  | 'gifts'
  | 'security'
  | 'transport'
  | 'food_trucks'
  | 'sound';

export interface PlanRule {
  /** the seeded service category name */
  category: string;
  priority: Priority;
  /** typical share of the total budget, in percent (normalised across the items returned) */
  share: number;
  /** one line on why it is on the list */
  why: string;
  /** how many days before the event people usually book it */
  lead_days: number;
  tip?: TipKind;
}

/** The categories seeded by the migration; every rule must use one of these names (unit-tested). */
export const SEEDED_CATEGORIES = [
  'Photography & Video',
  'Catering & Food',
  'Music & Entertainment',
  'Venues',
  'Decor & Florals',
  'Beauty & Glam',
  'Event Planning',
  'Rentals & Equipment',
  'Transportation',
  'Staffing & Services',
  'Kids & Family',
  'Stationery & Gifts',
  'Officiants & Ceremony',
] as const;

const rule = (category: string, priority: Priority, share: number, lead_days: number, why: string, tip?: TipKind): PlanRule => ({
  category,
  priority,
  share,
  lead_days,
  why,
  tip,
});

export const PLAN_RULES: Record<EventType, PlanRule[]> = {
  WEDDING: [
    rule('Venues', 'ESSENTIAL', 30, 300, 'Most couples book the venue first; the date usually follows it.', 'venue_capacity'),
    rule('Catering & Food', 'ESSENTIAL', 25, 180, 'Food and drink are usually the biggest cost after the venue.', 'per_person'),
    rule('Photography & Video', 'ESSENTIAL', 12, 270, 'Most weddings book a photographer, and the popular ones fill up a year out.', 'photographer'),
    rule('Music & Entertainment', 'ESSENTIAL', 8, 210, 'A DJ or band keeps the reception going.', 'sound'),
    rule('Officiants & Ceremony', 'ESSENTIAL', 2, 150, 'Someone has to lead the ceremony, so book the officiant early.'),
    rule('Decor & Florals', 'RECOMMENDED', 9, 150, 'Flowers and styling set the look of the day.', 'centerpieces'),
    rule('Event Planning', 'RECOMMENDED', 5, 300, 'A planner or day-of coordinator keeps every vendor on schedule.'),
    rule('Rentals & Equipment', 'RECOMMENDED', 3, 90, "Tables, chairs and linens if the venue doesn't supply them.", 'tables'),
    rule('Beauty & Glam', 'RECOMMENDED', 2, 120, 'Hair and makeup for the couple and the wedding party.'),
    rule('Staffing & Services', 'NICE_TO_HAVE', 2, 60, "Servers and bartenders if your caterer doesn't bring staff.", 'servers'),
    rule('Transportation', 'NICE_TO_HAVE', 1, 90, 'A car for the couple, or shuttles between ceremony and reception.', 'transport'),
    rule('Stationery & Gifts', 'NICE_TO_HAVE', 1, 120, 'Invitations go out 6 to 8 weeks before; favors are optional.', 'invitations'),
  ],
  BIRTHDAY: [
    rule('Catering & Food', 'ESSENTIAL', 30, 30, 'Food and a cake are what guests remember.', 'per_person'),
    rule('Venues', 'RECOMMENDED', 25, 60, "Book a space unless you're hosting at home.", 'venue_capacity'),
    rule('Music & Entertainment', 'RECOMMENDED', 15, 45, 'A DJ or entertainer gets the party going.', 'sound'),
    rule('Decor & Florals', 'RECOMMENDED', 10, 21, 'Balloons and a backdrop make the photos.', 'centerpieces'),
    rule('Photography & Video', 'NICE_TO_HAVE', 8, 30, 'Worth it for milestone birthdays.', 'photographer'),
    rule('Kids & Family', 'NICE_TO_HAVE', 7, 30, "For kids' parties: bounce houses, face painting and games."),
    rule('Rentals & Equipment', 'NICE_TO_HAVE', 5, 21, 'Extra tables and chairs if hosting at home.', 'tables'),
  ],
  CORPORATE: [
    rule('Venues', 'ESSENTIAL', 30, 120, 'Corporate spaces book out early around the holidays and conference season.', 'venue_capacity'),
    rule('Catering & Food', 'ESSENTIAL', 30, 60, 'Attendees expect food, coffee and drinks.', 'per_person'),
    rule('Rentals & Equipment', 'RECOMMENDED', 10, 45, 'Sound, screens and staging for talks and presentations.', 'tables'),
    rule('Photography & Video', 'RECOMMENDED', 8, 45, 'Photos for the company newsletter and socials.'),
    rule('Event Planning', 'RECOMMENDED', 8, 120, "A planner handles the logistics so your team doesn't have to."),
    rule('Music & Entertainment', 'NICE_TO_HAVE', 6, 60, 'A DJ or band for the evening part.'),
    rule('Decor & Florals', 'NICE_TO_HAVE', 3, 30, 'Branding, signage and table styling.', 'centerpieces'),
    rule('Staffing & Services', 'NICE_TO_HAVE', 3, 30, 'Servers, bartenders and a setup crew.', 'servers'),
    rule('Stationery & Gifts', 'NICE_TO_HAVE', 2, 30, 'Branded gifts or printed programs for attendees.', 'gifts'),
  ],
  CONCERT: [
    rule('Venues', 'ESSENTIAL', 35, 180, 'The venue sets your capacity and your date.', 'venue_capacity'),
    rule('Rentals & Equipment', 'ESSENTIAL', 25, 90, 'Stage, sound and lighting rigs.'),
    rule('Staffing & Services', 'ESSENTIAL', 12, 45, 'Security and crew keep a crowd safe.', 'security'),
    rule('Music & Entertainment', 'RECOMMENDED', 12, 120, 'Opening acts, an MC or a DJ between sets.'),
    rule('Catering & Food', 'RECOMMENDED', 8, 45, 'Food trucks or a bar for the crowd.', 'food_trucks'),
    rule('Photography & Video', 'RECOMMENDED', 5, 45, 'Footage and photos to promote the next show.'),
    rule('Transportation', 'NICE_TO_HAVE', 3, 60, 'Shuttles or valet when parking is tight.', 'transport'),
  ],
  CONFERENCE: [
    rule('Venues', 'ESSENTIAL', 35, 180, 'Conference spaces with breakout rooms book out early.', 'venue_capacity'),
    rule('Catering & Food', 'ESSENTIAL', 25, 60, 'Coffee, lunch and breaks for attendees.', 'per_person'),
    rule('Rentals & Equipment', 'ESSENTIAL', 15, 60, 'Screens, microphones and staging for speakers.'),
    rule('Event Planning', 'RECOMMENDED', 8, 180, 'A planner runs the agenda, speakers and suppliers.'),
    rule('Photography & Video', 'RECOMMENDED', 6, 45, 'Recordings of talks and photos for next year.'),
    rule('Staffing & Services', 'RECOMMENDED', 5, 30, 'Registration desk, ushers and security.', 'security'),
    rule('Stationery & Gifts', 'NICE_TO_HAVE', 2, 30, 'Badges, printed programs and attendee gifts.', 'gifts'),
    rule('Transportation', 'NICE_TO_HAVE', 2, 45, 'Shuttles between hotels and the venue.', 'transport'),
    rule('Officiants & Ceremony', 'NICE_TO_HAVE', 2, 45, 'Interpreters for sessions in more than one language.'),
  ],
  PRIVATE_PARTY: [
    rule('Catering & Food', 'ESSENTIAL', 35, 30, 'Good food and drinks make the party.', 'per_person'),
    rule('Venues', 'RECOMMENDED', 20, 60, "Book a space unless you're hosting at home.", 'venue_capacity'),
    rule('Music & Entertainment', 'RECOMMENDED', 15, 45, 'A DJ or live music sets the mood.', 'sound'),
    rule('Decor & Florals', 'RECOMMENDED', 10, 21, 'Lighting, flowers and a backdrop.', 'centerpieces'),
    rule('Staffing & Services', 'RECOMMENDED', 8, 21, 'Bartenders and servers so you can enjoy your own party.', 'servers'),
    rule('Rentals & Equipment', 'NICE_TO_HAVE', 7, 21, 'Tables, chairs and a dance floor.', 'tables'),
    rule('Photography & Video', 'NICE_TO_HAVE', 5, 21, 'A photographer to catch the night.'),
  ],
  OTHER: [
    rule('Venues', 'ESSENTIAL', 30, 90, 'Most events start with the space.', 'venue_capacity'),
    rule('Catering & Food', 'ESSENTIAL', 30, 45, 'Guests expect food and drink.', 'per_person'),
    rule('Music & Entertainment', 'RECOMMENDED', 12, 45, 'Music or entertainment keeps guests engaged.', 'sound'),
    rule('Decor & Florals', 'RECOMMENDED', 8, 30, 'Styling makes the space feel like an event.', 'centerpieces'),
    rule('Photography & Video', 'RECOMMENDED', 8, 30, 'Photos to remember it by.'),
    rule('Rentals & Equipment', 'NICE_TO_HAVE', 7, 30, 'Tables, chairs and sound if the space has none.', 'tables'),
    rule('Staffing & Services', 'NICE_TO_HAVE', 5, 21, 'Servers, setup crew or security.', 'servers'),
  ],
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A practical line from the guest count (and the item's suggested budget when known).
 * Without a guest count it falls back to a general hint, or nothing.
 */
export function guestTip(kind: TipKind | undefined, guests?: number | null, itemBudget?: number | null): string | null {
  if (!kind) return null;
  const g = guests && guests > 0 ? Math.round(guests) : null;
  switch (kind) {
    case 'per_person':
      if (!g) return 'Caterers price per person, so have a guest count ready.';
      return itemBudget ? `About ${money(itemBudget / g)} per person for ${g} guests.` : `Ask for quotes for ${g} guests, plus about 5% spare.`;
    case 'servers':
      return g ? `About ${plural(Math.max(1, Math.ceil(g / 25)), 'server')} (1 per 25 guests) and ${plural(Math.max(1, Math.ceil(g / 75)), 'bartender')} (1 per 75).` : 'Plan about 1 server per 25 guests.';
    case 'tables':
      return g ? `About ${plural(Math.ceil(g / 8), 'table')} (1 per 8 guests) and ${g} chairs.` : 'Plan about 1 table per 8 guests.';
    case 'venue_capacity':
      return g ? `Look for a space that comfortably holds ${g} guests.` : null;
    case 'photographer':
      return g && g > 150 ? 'Over 150 guests: ask about a second shooter.' : 'One photographer usually covers up to 150 guests.';
    case 'centerpieces':
      return g ? `About ${plural(Math.ceil(g / 8), 'centerpiece')}, one per table of 8.` : null;
    case 'invitations': {
      if (!g) return null;
      const n = Math.ceil((g * 11) / 20); // half the guests, plus 10%
      return `About ${plural(n, 'invitation')} (roughly 1 per couple, plus 10% spare).`;
    }
    case 'gifts':
      return g ? `About ${plural(g, 'gift')}, one per attendee.` : null;
    case 'security':
      return g ? `About ${plural(Math.max(1, Math.ceil(g / 100)), 'security guard')} (1 per 100 guests).` : 'Plan about 1 security guard per 100 guests.';
    case 'transport':
      return g && g >= 30 ? `About ${plural(Math.ceil(g / 50), 'shuttle')} if you're moving everyone (about 50 seats each).` : null;
    case 'food_trucks':
      return g ? `About ${plural(Math.max(1, Math.ceil(g / 150)), 'food truck')} (1 per 150 guests).` : null;
    case 'sound':
      return g && g > 150 ? 'Over 150 guests: ask for a bigger sound system.' : null;
  }
}

/** Share of the budget per item, normalised so the returned items add up to 100%. */
export function normaliseShares(shares: number[]): number[] {
  const total = shares.reduce((s, x) => s + Math.max(0, x), 0);
  if (total <= 0) return shares.map(() => 0);
  return shares.map((x) => (Math.max(0, x) / total) * 100);
}

/**
 * Splits a budget across items by share, in whole dollars, adding up to the budget exactly
 * (the rounding difference goes to the biggest item).
 */
export function splitBudget(budget: number, shares: number[]): number[] {
  const pct = normaliseShares(shares);
  const whole = Math.round(budget);
  const amounts = pct.map((p) => Math.round((whole * p) / 100));
  if (amounts.length) {
    const diff = whole - amounts.reduce((s, x) => s + x, 0);
    const biggest = pct.indexOf(Math.max(...pct));
    amounts[biggest] += diff;
  }
  return amounts;
}

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * When to book by: the event date minus the usual lead time. `book_soon` when that day has come
 * (less time left than people usually allow) and the event is still ahead.
 */
export function bookBy(eventDate: string | null | undefined, leadDays: number, today: Date = new Date()): { book_by: string | null; book_soon: boolean } {
  if (!eventDate) return { book_by: null, book_soon: false };
  const event = Date.parse(eventDate.slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(event)) return { book_by: null, book_soon: false };
  const by = event - leadDays * DAY;
  const now = utcDay(today);
  return { book_by: ymd(by), book_soon: now >= by && now <= event };
}

/** Category / budget-line text compared loosely: lower case, "&" as "and", no punctuation, no plural s. */
export function normaliseLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Other words planners use for a seeded category on a budget line (only used while the name matches). */
const BUDGET_ALIASES: Record<string, string[]> = {
  'Photography & Video': ['photographer', 'photos', 'videographer', 'videography'],
  'Catering & Food': ['caterer', 'food and drink', 'cake', 'drinks', 'bar'],
  'Music & Entertainment': ['music', 'dj', 'band', 'entertainment', 'entertainer'],
  Venues: ['venue', 'venue hire', 'hall', 'location'],
  'Decor & Florals': ['decor', 'decoration', 'flowers', 'florist', 'styling'],
  'Beauty & Glam': ['beauty', 'makeup', 'hair and makeup', 'glam'],
  'Event Planning': ['planner', 'planning', 'coordinator', 'coordination'],
  'Rentals & Equipment': ['rentals', 'rental', 'equipment', 'av', 'sound and av', 'tables and chairs'],
  Transportation: ['transport', 'cars', 'shuttle', 'shuttles'],
  'Staffing & Services': ['staff', 'staffing', 'servers', 'security', 'waitstaff'],
  'Kids & Family': ['kids', 'kids entertainment', 'children'],
  'Stationery & Gifts': ['stationery', 'invitations', 'favors', 'favours', 'gifts'],
  'Officiants & Ceremony': ['officiant', 'ceremony', 'interpreter'],
};

/**
 * Whether a budget line's category names this service category: the same name ("Catering & Food",
 * "catering and food"), one half of it ("Catering", "Photography", "Venue") or a common other word
 * for it ("DJ", "Florist").
 */
export function budgetLineMatches(line: string, categoryName: string): boolean {
  const a = normaliseLabel(line);
  if (!a) return false;
  const b = normaliseLabel(categoryName);
  if (a === b) return true;
  const halves = b.split(/\band\b/).map((p) => p.trim()).filter(Boolean);
  const aliasKey = Object.keys(BUDGET_ALIASES).find((k) => normaliseLabel(k) === b);
  const aliases = aliasKey ? BUDGET_ALIASES[aliasKey].map(normaliseLabel) : [];
  return halves.includes(a) || aliases.includes(a);
}

/** Bookings that no longer count towards covering a service. */
export const INACTIVE_BOOKING = ['CANCELLED', 'REJECTED'];

export type CoveredBy = 'booking' | 'budget' | 'venue';

/**
 * Whether an event already has this service: an active booking in the category, a budget line
 * naming it, or (for venues) a venue already set on the event.
 */
export function coveredBy(
  category: { id: string; name: string },
  event: {
    venue?: string | null;
    bookings: { status: string; category_id: string | null | undefined }[];
    budget_lines: string[];
  },
): CoveredBy | null {
  if (event.bookings.some((b) => b.category_id === category.id && !INACTIVE_BOOKING.includes(b.status))) return 'booking';
  if (event.budget_lines.some((l) => budgetLineMatches(l, category.name))) return 'budget';
  if (event.venue?.trim() && normaliseLabel(category.name) === normaliseLabel('Venues')) return 'venue';
  return null;
}

export interface ChecklistInput {
  event_type: EventType;
  guest_count?: number | null;
  budget?: number | null;
  /** yyyy-MM-dd */
  date?: string | null;
}

export interface ChecklistDraftItem {
  category: { id: string; name: string };
  priority: Priority;
  why: string;
  tip: string | null;
  lead_days: number;
  book_by: string | null;
  book_soon: boolean;
  share_percent: number;
  suggested_budget: number | null;
}

/**
 * The checklist for an event type, limited to categories that exist (matched by name, loosely),
 * sorted essential first, then by budget share.
 */
export function buildChecklist(input: ChecklistInput, categories: { id: string; name: string }[], today: Date = new Date()): ChecklistDraftItem[] {
  const rules = PLAN_RULES[input.event_type] ?? PLAN_RULES.OTHER;
  const byName = new Map(categories.map((c) => [normaliseLabel(c.name), c]));
  const matched = rules
    .map((r) => ({ rule: r, category: byName.get(normaliseLabel(r.category)) }))
    .filter((m): m is { rule: PlanRule; category: { id: string; name: string } } => !!m.category);
  // two rules can't point at the same category (keeps the split honest)
  const unique = matched.filter((m, i) => matched.findIndex((o) => o.category.id === m.category.id) === i);

  const shares = unique.map((m) => m.rule.share);
  const pct = normaliseShares(shares);
  const budget = input.budget != null && input.budget > 0 ? input.budget : null;
  const amounts = budget ? splitBudget(budget, shares) : null;

  const items = unique.map((m, i) => {
    const suggested = amounts ? amounts[i] : null;
    return {
      category: { id: m.category.id, name: m.category.name },
      priority: m.rule.priority,
      why: m.rule.why,
      tip: guestTip(m.rule.tip, input.guest_count, suggested),
      lead_days: m.rule.lead_days,
      ...bookBy(input.date, m.rule.lead_days, today),
      share_percent: Math.round(pct[i] * 10) / 10,
      suggested_budget: suggested,
    };
  });
  const rank = (p: Priority) => PRIORITIES.indexOf(p);
  return items.sort((a, b) => rank(a.priority) - rank(b.priority) || b.share_percent - a.share_percent);
}
