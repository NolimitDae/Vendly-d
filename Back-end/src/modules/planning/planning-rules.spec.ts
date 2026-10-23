import { readFileSync } from 'fs';
import { join } from 'path';
import { EventType } from 'prisma/generated/client';
import {
  PLAN_RULES,
  PRIORITIES,
  SEEDED_CATEGORIES,
  bookBy,
  budgetLineMatches,
  buildChecklist,
  coveredBy,
  guestTip,
  normaliseShares,
  splitBudget,
} from './planning-rules';

const seedSql = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261023090000_seed_service_categories/migration.sql'),
  'utf8',
);
const seededNames = [...seedSql.matchAll(/INSERT INTO "service_categories" \([^)]*\) VALUES \('[^']*', '([^']+)'/g)].map((m) => m[1]);
const categories = seededNames.map((name, i) => ({ id: `cat-${i}`, name }));
const today = new Date('2026-10-23T12:00:00Z');

describe('plan rules', () => {
  it('reads the seeded categories from the migration', () => {
    expect(seededNames.length).toBe(13);
    expect([...SEEDED_CATEGORIES].sort()).toEqual([...seededNames].sort());
  });

  it.each(Object.values(EventType))('%s: every rule names a seeded category, once, with sane values', (type) => {
    const rules = PLAN_RULES[type];
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const r of rules) {
      expect(seededNames).toContain(r.category);
      expect(PRIORITIES).toContain(r.priority);
      expect(r.share).toBeGreaterThan(0);
      expect(r.lead_days).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(10);
    }
    expect(new Set(rules.map((r) => r.category)).size).toBe(rules.length);
    expect(rules.some((r) => r.priority === 'ESSENTIAL')).toBe(true);
  });

  it('weddings start with the venue, food, a photographer and an officiant', () => {
    const essentials = PLAN_RULES.WEDDING.filter((r) => r.priority === 'ESSENTIAL').map((r) => r.category);
    expect(essentials).toEqual(expect.arrayContaining(['Venues', 'Catering & Food', 'Photography & Video', 'Officiants & Ceremony']));
  });
});

describe('budget shares', () => {
  it('normalise to 100%', () => {
    const pct = normaliseShares([30, 20, 10]);
    expect(pct.reduce((s, x) => s + x, 0)).toBeCloseTo(100);
    expect(pct[0]).toBeCloseTo(50);
    expect(normaliseShares([0, 0])).toEqual([0, 0]);
  });

  it('split a budget in whole dollars that add up exactly', () => {
    const amounts = splitBudget(10001, [33, 33, 34]);
    expect(amounts.reduce((s, x) => s + x, 0)).toBe(10001);
    amounts.forEach((a) => expect(Number.isInteger(a)).toBe(true));
  });

  it.each(Object.values(EventType))('%s: suggested budgets add up to the budget', (type) => {
    const items = buildChecklist({ event_type: type, budget: 23456 }, categories, today);
    expect(items.reduce((s, i) => s + (i.suggested_budget ?? 0), 0)).toBe(23456);
    expect(items.reduce((s, i) => s + i.share_percent, 0)).toBeCloseTo(100, 0);
  });

  it('re-normalise across the categories that exist when some are missing', () => {
    const onlyTwo = categories.filter((c) => ['Venues', 'Catering & Food'].includes(c.name));
    const items = buildChecklist({ event_type: 'WEDDING', budget: 11000 }, onlyTwo, today);
    expect(items.map((i) => i.category.name)).toEqual(['Venues', 'Catering & Food']);
    // 30 : 25
    expect(items[0].suggested_budget).toBe(6000);
    expect(items[1].suggested_budget).toBe(5000);
  });

  it('leave suggested budgets empty without a budget', () => {
    const items = buildChecklist({ event_type: 'BIRTHDAY' }, categories, today);
    items.forEach((i) => expect(i.suggested_budget).toBeNull());
  });
});

describe('buildChecklist', () => {
  it('skips rules whose category was deleted and matches renamed casing / "and"', () => {
    const cats = [
      { id: 'a', name: 'venues' },
      { id: 'b', name: 'Catering and Food' },
      { id: 'c', name: 'Something New' },
    ];
    const items = buildChecklist({ event_type: 'WEDDING' }, cats, today);
    expect(items.map((i) => i.category)).toEqual([
      { id: 'a', name: 'venues' },
      { id: 'b', name: 'Catering and Food' },
    ]);
  });

  it('returns nothing when no category exists', () => {
    expect(buildChecklist({ event_type: 'CONCERT', budget: 1000 }, [], today)).toEqual([]);
  });

  it('sorts essential first, then by share', () => {
    const items = buildChecklist({ event_type: 'WEDDING' }, categories, today);
    const ranks = items.map((i) => PRIORITIES.indexOf(i.priority));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(items[0].category.name).toBe('Venues');
  });

  it('adds book-by dates from the event date', () => {
    const items = buildChecklist({ event_type: 'WEDDING', date: '2027-10-23' }, categories, today);
    const venue = items.find((i) => i.category.name === 'Venues')!;
    expect(venue.book_by).toBe('2026-12-27'); // 300 days before
    expect(venue.book_soon).toBe(false);
  });
});

describe('bookBy', () => {
  it('is the event date minus the lead time', () => {
    expect(bookBy('2027-03-01', 30, today)).toEqual({ book_by: '2027-01-30', book_soon: false });
  });
  it('flags book soon once inside the lead time', () => {
    expect(bookBy('2026-11-10', 30, today)).toEqual({ book_by: '2026-10-11', book_soon: true });
    // exactly on the book-by day
    expect(bookBy('2026-11-22', 30, today).book_soon).toBe(true);
  });
  it('does not flag past events', () => {
    expect(bookBy('2026-10-01', 30, today).book_soon).toBe(false);
  });
  it('handles no date and full ISO datetimes', () => {
    expect(bookBy(null, 30, today)).toEqual({ book_by: null, book_soon: false });
    expect(bookBy('2027-03-01T18:30:00.000Z', 1, today).book_by).toBe('2027-02-28');
  });
});

describe('guest-count tips', () => {
  it('catering per person from the budget', () => {
    expect(guestTip('per_person', 100, 5000)).toBe('About $50 per person for 100 guests.');
    expect(guestTip('per_person', 100, null)).toContain('100 guests');
    expect(guestTip('per_person', null, 5000)).toContain('per person');
  });
  it('servers, tables and centerpieces scale with guests', () => {
    expect(guestTip('servers', 100)).toBe('About 4 servers (1 per 25 guests) and 2 bartenders (1 per 75).');
    expect(guestTip('servers', 10)).toBe('About 1 server (1 per 25 guests) and 1 bartender (1 per 75).');
    expect(guestTip('tables', 100)).toBe('About 13 tables (1 per 8 guests) and 100 chairs.');
    expect(guestTip('centerpieces', 64)).toBe('About 8 centerpieces, one per table of 8.');
  });
  it('photographer and sound change over 150 guests', () => {
    expect(guestTip('photographer', 200)).toContain('second shooter');
    expect(guestTip('photographer', 80)).toContain('up to 150');
    expect(guestTip('sound', 80)).toBeNull();
    expect(guestTip('sound', 300)).toContain('bigger sound');
  });
  it('others', () => {
    expect(guestTip('invitations', 100)).toBe('About 55 invitations (roughly 1 per couple, plus 10% spare).');
    expect(guestTip('security', 250)).toBe('About 3 security guards (1 per 100 guests).');
    expect(guestTip('transport', 120)).toContain('3 shuttles');
    expect(guestTip('transport', 10)).toBeNull();
    expect(guestTip('food_trucks', 400)).toBe('About 3 food trucks (1 per 150 guests).');
    expect(guestTip('venue_capacity', 90)).toContain('90 guests');
    expect(guestTip('venue_capacity', null)).toBeNull();
    expect(guestTip(undefined, 100)).toBeNull();
  });
  it('flow into the checklist', () => {
    const items = buildChecklist({ event_type: 'WEDDING', guest_count: 100, budget: 20000 }, categories, today);
    const food = items.find((i) => i.category.name === 'Catering & Food')!;
    expect(food.tip).toBe(`About $${Math.round(food.suggested_budget! / 100)} per person for 100 guests.`);
  });
});

describe('covered detection', () => {
  const photo = { id: 'p', name: 'Photography & Video' };
  const venues = { id: 'v', name: 'Venues' };
  const none = { venue: null, bookings: [], budget_lines: [] };

  it('by an active booking in the category', () => {
    expect(coveredBy(photo, { ...none, bookings: [{ status: 'CONFIRMED', category_id: 'p' }] })).toBe('booking');
    expect(coveredBy(photo, { ...none, bookings: [{ status: 'PENDING', category_id: 'p' }] })).toBe('booking');
  });
  it('not by cancelled or rejected bookings, or other categories', () => {
    expect(coveredBy(photo, { ...none, bookings: [{ status: 'CANCELLED', category_id: 'p' }, { status: 'REJECTED', category_id: 'p' }] })).toBeNull();
    expect(coveredBy(photo, { ...none, bookings: [{ status: 'CONFIRMED', category_id: 'x' }] })).toBeNull();
  });
  it('by a budget line naming the category', () => {
    expect(coveredBy(photo, { ...none, budget_lines: ['Photography & Video'] })).toBe('budget');
    expect(coveredBy(photo, { ...none, budget_lines: ['photography and video'] })).toBe('budget');
    expect(coveredBy(photo, { ...none, budget_lines: ['Photographer'] })).toBe('budget');
    expect(coveredBy(photo, { ...none, budget_lines: ['Catering'] })).toBeNull();
  });
  it('venues by a venue set on the event', () => {
    expect(coveredBy(venues, { ...none, venue: 'The Grand Hall' })).toBe('venue');
    expect(coveredBy(venues, { ...none, venue: '  ' })).toBeNull();
    expect(coveredBy(photo, { ...none, venue: 'The Grand Hall' })).toBeNull();
  });
  it('budget line matching', () => {
    expect(budgetLineMatches('Catering', 'Catering & Food')).toBe(true);
    expect(budgetLineMatches('Food', 'Catering & Food')).toBe(true);
    expect(budgetLineMatches('Venue', 'Venues')).toBe(true);
    expect(budgetLineMatches('DJ', 'Music & Entertainment')).toBe(true);
    expect(budgetLineMatches('Florist', 'Decor & Florals')).toBe(true);
    expect(budgetLineMatches('', 'Venues')).toBe(false);
    expect(budgetLineMatches('Cater', 'Catering & Food')).toBe(false);
  });
});
