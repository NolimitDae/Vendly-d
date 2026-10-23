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
  vendorContract: { findFirst: jest.fn().mockResolvedValue(null) },
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
          where: expect.objectContaining({ vendor: { calendarBusyBlocks: { none: { start_date: { lte: day }, end_date: { gte: day } } } } }),
        }),
      );
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

  describe('getListing', () => {
    it('should return a single listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);

      const result = await service.getListing('listing-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException for non-existent listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      await expect(service.getListing('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('shows the cancellation policy from the contract this package would use (a package-specific one wins)', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      mockPrisma.vendorContract.findFirst.mockResolvedValueOnce({ field_values: { cancellation_policy: 'strict' } });
      const result = await service.getListing('listing-1');
      expect(result.data.cancellation_policy).toMatchObject({ key: 'strict', label: 'Strict' });
      expect(mockPrisma.vendorContract.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ applies_to_all: false }) }));
    });

    it('falls back to the vendor’s contract for all packages, and to nothing without one', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.review.groupBy.mockResolvedValue([]);
      mockPrisma.vendorContract.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ field_values: { cancellation_policy: 'flexible' } });
      expect((await service.getListing('listing-1')).data.cancellation_policy).toMatchObject({ key: 'flexible' });
      mockPrisma.vendorContract.findFirst.mockResolvedValue(null);
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
