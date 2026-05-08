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
  vendorListing: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
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
