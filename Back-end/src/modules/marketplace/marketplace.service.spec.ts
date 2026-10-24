import { ACTIVE_VENDOR_WHERE } from 'src/common/helper/active-vendor';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListingStatus } from 'prisma/generated/client';

const mockListing = {
  id: 'listing-1',
  title: 'Wedding Photography',
  description: 'Professional wedding photographer',
  price: 500,
  price_unit: 'event',
  images: [],
  tags: ['wedding', 'photography'],
  location: 'New York',
  status: ListingStatus.ACTIVE,
  deleted_at: null,
  category: { id: 'cat-1', name: 'Photography' },
  sub_category: null,
  vendor: { id: 'v1', name: 'Vendor', avatar: null, vendorProfile: { business_name: 'Photo Pro' } },
  reviews: [],
  _count: { reviews: 0, bookings: 0 },
};

const mockPrisma = {
  vendorContract: { findMany: jest.fn().mockResolvedValue([]) },
  vendorListing: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  listingAvailability: { findMany: jest.fn() },
  calendarBusyBlock: { findMany: jest.fn() },
  user: { findFirst: jest.fn() },
  review: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  serviceCategory: { findMany: jest.fn() },
};

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('vendors who cancel too often are shown last', () => {
    const listing = (id: string, vendorId: string, extra: Record<string, unknown> = {}) => ({ ...mockListing, id, vendor_id: vendorId, vendor: { ...mockListing.vendor, id: vendorId }, ...extra });
    beforeEach(() => {
      (mockPrisma as any).booking = { groupBy: jest.fn().mockResolvedValue([{ vendor_id: 'bad' }]) };
      mockPrisma.review.groupBy.mockResolvedValue([]);
    });
    afterEach(() => delete (mockPrisma as any).booking);

    it('reads vendors with 2 or more of their own cancellations in 90 days', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      await service.searchListings({ page: 1, limit: 12 });
      const args = (mockPrisma as any).booking.groupBy.mock.calls[0][0];
      expect(args.where).toMatchObject({ status: 'CANCELLED', cancelled_by: 'VENDOR', OR: [{ cancel_reason_code: null }, { cancel_reason_code: { notIn: ['customer_didnt_pay', 'safety_concern', 'non_payment'] } }] });
      expect(args.having).toEqual({ vendor_id: { _count: { gte: 2 } } });
    });

    it('fills a page from everyone else first, in the same order, then the demoted vendors', async () => {
      // 3 others match, then the demoted vendor's packages; page 1 of 2 per page, then page 2
      mockPrisma.vendorListing.count.mockImplementation(({ where }: any) => Promise.resolve(where.AND ? 3 : 5));
      mockPrisma.vendorListing.findMany.mockImplementation(({ where, skip, take }: any) => {
        const others = [listing('a', 'v1'), listing('b', 'v2'), listing('c', 'v3')];
        const demoted = [listing('x', 'bad'), listing('y', 'bad')];
        const rows = where.AND[1].vendor_id.notIn ? others : demoted;
        return Promise.resolve(rows.slice(skip, skip + take));
      });

      const first = await service.searchListings({ page: 1, limit: 2 });
      expect(first.data.map((l: any) => l.id)).toEqual(['a', 'b']);
      expect(first.meta.total).toBe(5);
      const second = await service.searchListings({ page: 2, limit: 2 });
      expect(second.data.map((l: any) => l.id)).toEqual(['c', 'x']);
      const third = await service.searchListings({ page: 3, limit: 2 });
      expect(third.data.map((l: any) => l.id)).toEqual(['y']);
    });

    it('sorted by rating (in memory): demoted vendors go after the rest, each group still by rating', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(3);
      mockPrisma.vendorListing.findMany.mockResolvedValue([listing('x', 'bad'), listing('a', 'v1'), listing('b', 'v2')]);
      mockPrisma.review.groupBy.mockResolvedValue([{ listing_id: 'x', _avg: { rating: 5 } }, { listing_id: 'a', _avg: { rating: 3 } }, { listing_id: 'b', _avg: { rating: 4 } }]);
      const res = await service.searchListings({ sort: 'rating', page: 1, limit: 12 });
      expect(res.data.map((l: any) => l.id)).toEqual(['b', 'a', 'x']);
    });

    it('similar vendors: one package per other vendor free that day, same category', async () => {
      (mockPrisma as any).booking.groupBy.mockResolvedValue([]);
      mockPrisma.vendorListing.count.mockResolvedValue(3);
      mockPrisma.vendorListing.findMany.mockResolvedValue([listing('own', 'me'), listing('a', 'v1'), listing('a2', 'v1'), listing('b', 'v2')]);
      const picks = await service.similarAvailable({ categoryId: 'cat-1', date: '2026-12-05', excludeVendorId: 'me', take: 4 });
      expect(picks.map((p) => p.id)).toEqual(['a', 'b']);
      expect(mockPrisma.vendorListing.findMany.mock.calls[0][0].where).toMatchObject({ category_id: 'cat-1', blockedDates: expect.anything() });
    });
  });

  describe('searchListings', () => {
    it('should return paginated listings', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(1);
      mockPrisma.vendorListing.findMany.mockResolvedValue([mockListing]);
      mockPrisma.review.groupBy.mockResolvedValue([]);

      const result = await service.searchListings({ page: 1, limit: 12 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply search query filter', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);

      await service.searchListings({ q: 'photography', page: 1, limit: 12 });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: expect.objectContaining({ contains: 'photography' }) }),
            ]),
          }),
        }),
      );
    });

    it('should apply price range filter', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);

      await service.searchListings({ min_price: 100, max_price: 500, page: 1 });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: { gte: 100, lte: 500 },
          }),
        }),
      );
    });

    it('leaves out packages the vendor blocked on the chosen date', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      await service.searchListings({ date: '2026-11-14', page: 1 });
      const day = new Date('2026-11-14T00:00:00.000Z');
      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ blockedDates: { none: { start_date: { lte: day }, end_date: { gte: day } } } }),
      });
    });

    it('leaves out vendors whose synced calendar is busy on the chosen date', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      await service.searchListings({ date: '2026-11-14', page: 1 });
      const day = new Date('2026-11-14T00:00:00.000Z');
      expect(mockPrisma.vendorListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vendor: { ...ACTIVE_VENDOR_WHERE, calendarBusyBlocks: { none: { start_date: { lte: day }, end_date: { gte: day } } } } }),
        }),
      );
    });

    it('leaves out suspended and deleted vendors', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      await service.searchListings({ page: 1 });
      const where = { status: 'ACTIVE', deleted_at: null, vendor: { deleted_at: null, OR: [{ status: null }, { status: { not: 0 } }] } };
      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.vendorListing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('finds packages near a point, nearest first, with their distance', async () => {
      const near = { ...mockListing, id: 'near', lat: 29.78, lng: -95.4 };
      const far = { ...mockListing, id: 'far', lat: 29.79, lng: -95.82 };
      const unknown = { ...mockListing, id: 'unknown', lat: null, lng: null };
      mockPrisma.vendorListing.count.mockResolvedValue(3);
      mockPrisma.vendorListing.findMany.mockResolvedValue([far, unknown, near]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      const res = await service.searchListings({ near_lat: 29.76, near_lng: -95.37, radius_miles: 30, page: 1, limit: 12 });
      expect(res.data.map((l: any) => l.id)).toEqual(['near', 'far']);
      expect(res.data[0].distance_miles).toBeLessThan(3);
      // the distance is shared, never the vendor's position
      expect(res.data[0]).not.toHaveProperty('lat');
      expect(res.data[0]).not.toHaveProperty('lng');
      expect(res.meta.total).toBe(2);
      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith({ where: expect.objectContaining({ lat: expect.any(Object), lng: expect.any(Object) }) });
    });

    it('also finds vendors based further away who travel to the customer', async () => {
      const travels = { ...mockListing, id: 'travels', lat: 29.79, lng: -95.82, service_radius_miles: 40 }; // ~27 mi away
      const stays = { ...mockListing, id: 'stays', lat: 29.79, lng: -95.82, service_radius_miles: 10 };
      mockPrisma.vendorListing.count.mockResolvedValue(2);
      mockPrisma.vendorListing.findMany.mockResolvedValue([travels, stays]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      const res = await service.searchListings({ near_lat: 29.76, near_lng: -95.37, radius_miles: 10, page: 1, limit: 12 });
      expect(res.data.map((l: any) => l.id)).toEqual(['travels']);
      expect(res.data[0].service_radius_miles).toBe(40);
    });

    it('filters by minimum rating and counts only the matches', async () => {
      const a = { ...mockListing, id: 'a' };
      const b = { ...mockListing, id: 'b' };
      mockPrisma.vendorListing.count.mockResolvedValue(2);
      mockPrisma.vendorListing.findMany.mockResolvedValue([a, b]);
      mockPrisma.review.groupBy.mockResolvedValue([{ listing_id: 'a', _avg: { rating: 4.6 } }, { listing_id: 'b', _avg: { rating: 3.2 } }]);
      const res = await service.searchListings({ min_rating: 4, page: 1, limit: 12 });
      expect(res.data.map((l: any) => l.id)).toEqual(['a']);
      expect(res.meta.total).toBe(1);
      // ratings come from reviews, so everything matching is loaded before paging
      expect(mockPrisma.vendorListing.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: undefined }));
    });
  });

  describe('licence documents', () => {
    it('are never read for the public shop page or a listing', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'v1', name: 'Vendor', avatar: null, vendorProfile: { business_name: 'Photo Pro' }, vendorListings: [], _count: {} });
      mockPrisma.review.aggregate.mockResolvedValue({ _avg: { rating: null } });
      const shop = await service.getVendorProfile('v1');
      expect(JSON.stringify(mockPrisma.user.findFirst.mock.calls[0][0])).not.toContain('license_photo');
      expect(JSON.stringify(shop)).not.toMatch(/license_photo|licence-files/);

      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      const listing = await service.getListing('listing-1');
      expect(JSON.stringify(mockPrisma.vendorListing.findFirst.mock.calls[0][0])).not.toContain('license_photo');
      expect(JSON.stringify(listing)).not.toMatch(/license_photo|licence-files/);
    });
  });

  describe('suspended or deleted vendors', () => {
    it('their package page, shop and featured packages are not shown', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);
      await expect(service.getListing('listing-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.vendorListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'listing-1', vendor: ACTIVE_VENDOR_WHERE }) }));

      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getVendorProfile('v1')).rejects.toThrow('Vendor not found');
      expect(mockPrisma.user.findFirst.mock.calls.at(-1)[0].where.AND[0]).toEqual(ACTIVE_VENDOR_WHERE);

      mockPrisma.vendorListing.findMany.mockResolvedValue([]);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      await service.getFeaturedListings();
      expect(mockPrisma.vendorListing.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendor: ACTIVE_VENDOR_WHERE }) }));
    });
  });

  describe('getListing', () => {
    it('should return a single listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);

      const result = await service.getListing('listing-1');
      expect(result.success).toBe(true);
    });

    it('shows the vendor’s working hours on the listing', async () => {
      const hours = {
        mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' }, wed: { open: '09:00', close: '17:00' },
        thu: { open: '09:00', close: '17:00' }, fri: { open: '09:00', close: '17:00' }, sat: { open: '10:00', close: '14:00' }, sun: null,
      };
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, vendor: { ...mockListing.vendor, vendorProfile: { business_name: 'Photo Pro', working_hours: hours } } });
      mockPrisma.review.groupBy.mockResolvedValue([]);
      const result = await service.getListing('listing-1');
      expect(result.data.working_hours).toEqual(hours);
      expect(result.data.working_hours_summary).toBe('Mon–Fri 9am–5pm · Sat 10am–2pm');
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      expect((await service.getListing('listing-1')).data.working_hours).toBeNull();
    });

    it('should throw NotFoundException for non-existent listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      await expect(service.getListing('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('shows the cancellation policy from the contract this package would use (a package-specific one wins)', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      mockPrisma.vendorContract.findMany.mockResolvedValueOnce([
        { version: 2, applies_to_all: true, category_ids: [], listings: [], field_values: { cancellation_policy: 'flexible' } },
        { version: 1, applies_to_all: false, category_ids: [], listings: [{ listing_id: 'listing-1' }], field_values: { cancellation_policy: 'strict' } },
      ]);
      const result = await service.getListing('listing-1');
      expect(result.data.cancellation_policy).toMatchObject({ key: 'strict', label: 'Strict' });
    });

    it('falls back to the vendor’s contract for all packages, and to nothing without one', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      mockPrisma.vendorContract.findMany.mockResolvedValueOnce([
        { version: 1, applies_to_all: true, category_ids: [], listings: [], field_values: { cancellation_policy: 'flexible' } },
      ]);
      expect((await service.getListing('listing-1')).data.cancellation_policy).toMatchObject({ key: 'flexible' });
      mockPrisma.vendorContract.findMany.mockResolvedValue([]);
      expect((await service.getListing('listing-1')).data.cancellation_policy).toBeNull();
    });
  });

  describe('getBlockedDates', () => {
    const d = (s: string) => new Date(s + 'T00:00:00.000Z');

    it('adds the vendor’s imported busy days to the manual blocks, merged and without details', async () => {
      mockPrisma.listingAvailability.findMany.mockResolvedValue([{ id: 'blk-1', start_date: d('2099-11-10'), end_date: d('2099-11-12'), reason: 'Holiday' }]);
      mockPrisma.vendorListing.findUnique.mockResolvedValue({ vendor_id: 'v1' });
      mockPrisma.calendarBusyBlock.findMany.mockResolvedValue([
        { start_date: d('2099-11-01'), end_date: d('2099-11-01') },
        { start_date: d('2099-11-01'), end_date: d('2099-11-02') },
        { start_date: d('2099-11-03'), end_date: d('2099-11-03') },
        { start_date: d('2099-11-20'), end_date: d('2099-11-20') },
      ]);

      const result = await service.getBlockedDates('listing-1');

      expect(mockPrisma.calendarBusyBlock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: 'v1' }) }));
      expect(result.data).toEqual([
        { id: 'calendar-2099-11-01', start_date: d('2099-11-01'), end_date: d('2099-11-03'), reason: null, source: 'calendar' },
        { id: 'blk-1', start_date: d('2099-11-10'), end_date: d('2099-11-12'), reason: 'Holiday', source: 'manual' },
        { id: 'calendar-2099-11-20', start_date: d('2099-11-20'), end_date: d('2099-11-20'), reason: null, source: 'calendar' },
      ]);
    });

    it('gives the vendor’s weekly working hours beside the blocked days', async () => {
      const hours = {
        mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' }, wed: { open: '09:00', close: '17:00' },
        thu: { open: '09:00', close: '17:00' }, fri: { open: '09:00', close: '17:00' }, sat: null, sun: null,
      };
      mockPrisma.listingAvailability.findMany.mockResolvedValue([]);
      mockPrisma.calendarBusyBlock.findMany.mockResolvedValue([]);
      mockPrisma.vendorListing.findUnique.mockResolvedValue({ vendor_id: 'v1', vendor: { vendorProfile: { working_hours: hours } } });
      const result = await service.getBlockedDates('listing-1');
      expect(result).toMatchObject({ data: [], working_hours: hours, working_hours_summary: 'Mon–Fri 9am–5pm' });

      mockPrisma.vendorListing.findUnique.mockResolvedValue({ vendor_id: 'v1', vendor: { vendorProfile: { working_hours: null } } });
      expect(await service.getBlockedDates('listing-1')).toMatchObject({ working_hours: null, working_hours_summary: null });
    });

    it('returns only manual blocks for an unknown listing', async () => {
      mockPrisma.listingAvailability.findMany.mockResolvedValue([]);
      mockPrisma.vendorListing.findUnique.mockResolvedValue(null);
      const result = await service.getBlockedDates('nope');
      expect(result.data).toEqual([]);
      expect(mockPrisma.calendarBusyBlock.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCategories', () => {
    it('should return categories', async () => {
      mockPrisma.serviceCategory.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Photography', sub_categories: [], _count: { vendor_listings: 5 } },
      ]);

      const result = await service.getCategories();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });
});
