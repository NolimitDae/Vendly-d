import { ACTIVE_VENDOR_WHERE } from 'src/common/helper/active-vendor';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListingStatus } from 'prisma/generated/client';
import { PlanningService } from './planning.service';

jest.mock('src/modules/geo/geo', () => ({
  ...jest.requireActual('src/modules/geo/geo'),
  geocode: jest.fn(),
}));
import { geocode } from 'src/modules/geo/geo';

const categories = [
  { id: 'venue', name: 'Venues' },
  { id: 'food', name: 'Catering & Food' },
  { id: 'photo', name: 'Photography & Video' },
  { id: 'music', name: 'Music & Entertainment' },
  { id: 'decor', name: 'Decor & Florals' },
];

const prisma = {
  serviceCategory: { findMany: jest.fn() },
  vendorListing: { findMany: jest.fn(), groupBy: jest.fn() },
  event: { findUnique: jest.fn() },
};
const today = new Date('2026-10-23T12:00:00Z');

describe('PlanningService', () => {
  let service: PlanningService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.serviceCategory.findMany.mockResolvedValue(categories);
    prisma.vendorListing.groupBy.mockResolvedValue([
      { category_id: 'venue', _count: { _all: 3 } },
      { category_id: 'photo', _count: { _all: 7 } },
    ]);
    prisma.vendorListing.findMany.mockResolvedValue([]);
    (geocode as jest.Mock).mockResolvedValue(null);
    service = new PlanningService(prisma as any);
  });

  describe('checklist', () => {
    it('returns only existing categories with counts, budget split and a search link', async () => {
      const res = await service.checklist({ event_type: 'BIRTHDAY', guest_count: 40, budget: 2000, date: '2026-12-05' }, today);
      const names = res.data.items.map((i) => i.category.name);
      // birthday rules for Kids & Family / Rentals are skipped: no such categories here
      expect(names).toEqual(['Catering & Food', 'Venues', 'Music & Entertainment', 'Decor & Florals', 'Photography & Video']);
      expect(res.data.items.reduce((s, i) => s + (i.suggested_budget ?? 0), 0)).toBe(2000);
      const venue = res.data.items.find((i) => i.category.id === 'venue')!;
      expect(venue.available_vendors).toBe(3);
      expect(res.data.items.find((i) => i.category.id === 'food')!.available_vendors).toBe(0);
      expect(venue.search).toEqual({ category_id: 'venue', date: '2026-12-05', near_lat: null, near_lng: null, radius_miles: null, location: null });
      expect(venue.book_by).toBe('2026-10-06');
      expect(venue.book_soon).toBe(true);
    });

    it('counts only ACTIVE listings free that day in those categories', async () => {
      await service.checklist({ event_type: 'WEDDING', date: '2027-06-12' }, today);
      const where = prisma.vendorListing.groupBy.mock.calls[0][0].where;
      expect(where.status).toBe(ListingStatus.ACTIVE);
      expect(where.deleted_at).toBeNull();
      expect(where.category_id.in).toEqual(expect.arrayContaining(['venue', 'food', 'photo']));
      const day = new Date('2027-06-12T00:00:00.000Z');
      expect(where.blockedDates).toEqual({ none: { start_date: { lte: day }, end_date: { gte: day } } });
      expect(where.vendor).toEqual({ ...ACTIVE_VENDOR_WHERE, calendarBusyBlocks: { none: { start_date: { lte: day }, end_date: { gte: day } } } });
    });

    it('skips the date filter without a date, but still leaves out suspended and deleted vendors', async () => {
      await service.checklist({ event_type: 'WEDDING' }, today);
      const where = prisma.vendorListing.groupBy.mock.calls[0][0].where;
      expect(where.blockedDates).toBeUndefined();
      expect(where.vendor).toEqual(ACTIVE_VENDOR_WHERE);
    });

    it('near a point: counts listings within 25 miles or that travel that far', async () => {
      prisma.vendorListing.findMany.mockResolvedValue([
        { category_id: 'photo', lat: 29.76, lng: -95.37, service_radius_miles: null }, // same spot
        { category_id: 'photo', lat: 30.27, lng: -97.74, service_radius_miles: null }, // Austin, ~145 mi
        { category_id: 'photo', lat: 30.27, lng: -97.74, service_radius_miles: 200 }, // Austin, travels
        { category_id: 'venue', lat: null, lng: null, service_radius_miles: null },
      ]);
      const res = await service.checklist({ event_type: 'WEDDING', lat: 29.76, lng: -95.37, location: 'Houston, TX' }, today);
      expect(prisma.vendorListing.groupBy).not.toHaveBeenCalled();
      const where = prisma.vendorListing.findMany.mock.calls[0][0].where;
      expect(where.lat.gte).toBeLessThan(29.76);
      expect(where.lng.lte).toBeGreaterThan(-95.37);
      expect(res.data.items.find((i) => i.category.id === 'photo')!.available_vendors).toBe(2);
      expect(res.data.items.find((i) => i.category.id === 'venue')!.available_vendors).toBe(0);
      expect(res.data.near).toEqual({ lat: 29.76, lng: -95.37, label: 'Houston, TX' });
      expect(res.data.items[0].search).toMatchObject({ near_lat: 29.76, near_lng: -95.37, radius_miles: 25, location: 'Houston, TX' });
      expect(geocode).not.toHaveBeenCalled();
    });

    it('geocodes location text, and carries on without a position if that fails', async () => {
      (geocode as jest.Mock).mockResolvedValueOnce({ lat: 40.7, lng: -74 });
      const a = await service.checklist({ event_type: 'OTHER', location: 'Brooklyn' }, today);
      expect(a.data.near).toEqual({ lat: 40.7, lng: -74, label: 'Brooklyn' });

      (geocode as jest.Mock).mockRejectedValueOnce(new Error('down'));
      const b = await service.checklist({ event_type: 'OTHER', location: 'Brooklyn' }, today);
      expect(b.data.near).toBeNull();
      expect(b.data.items[0].search.location).toBe('Brooklyn');
    });
  });

  describe('eventPlan', () => {
    const event = {
      id: 'e1',
      name: 'Ada & Sam',
      event_planner_id: 'planner-1',
      type: 'WEDDING',
      date: new Date('2027-06-12T17:00:00Z'),
      venue: null,
      guest_count: 100,
      total_budget: '30000.00',
      status: 'PLANNING',
      bookings: [
        { booking: { status: 'CONFIRMED', listing: { category_id: 'photo' } } },
        { booking: { status: 'CANCELLED', listing: { category_id: 'music' } } },
      ],
      budget_items: [{ category: 'Catering' }],
    };

    it('404s and 403s', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);
      await expect(service.eventPlan('e1', 'planner-1', today)).rejects.toThrow(NotFoundException);
      prisma.event.findUnique.mockResolvedValueOnce(event);
      await expect(service.eventPlan('e1', 'someone-else', today)).rejects.toThrow(ForbiddenException);
    });

    it('marks what is booked or budgeted', async () => {
      prisma.event.findUnique.mockResolvedValue(event);
      const res = await service.eventPlan('e1', 'planner-1', today);
      const by = Object.fromEntries(res.data.items.map((i) => [i.category.id, i.covered_by]));
      expect(by).toEqual({ venue: null, food: 'budget', photo: 'booking', music: null, decor: null });
      expect(res.data.summary).toEqual({ total: 5, covered: 2 });
      expect(res.data.date).toBe('2027-06-12');
      expect(res.data.items.reduce((s, i) => s + (i.suggested_budget ?? 0), 0)).toBe(30000);
      expect(res.data.event).toEqual({ id: 'e1', name: 'Ada & Sam', status: 'PLANNING', type_set: true });
    });

    it('uses the venue for location and counts it as covering venues; no type = general rules', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...event, type: null, venue: 'The Grand Hall, Houston', bookings: [], budget_items: [] });
      (geocode as jest.Mock).mockResolvedValueOnce({ lat: 29.76, lng: -95.37 });
      const res = await service.eventPlan('e1', 'planner-1', today);
      expect(res.data.event_type).toBe('OTHER');
      expect(res.data.event.type_set).toBe(false);
      expect(geocode).toHaveBeenCalledWith('The Grand Hall, Houston');
      expect(res.data.items.find((i) => i.category.id === 'venue')!.covered_by).toBe('venue');
    });
  });
});
