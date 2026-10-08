import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VendorListingService } from './listing.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListingStatus } from 'prisma/generated/client';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    put: jest.fn().mockResolvedValue(undefined),
    url: jest.fn((path: string) => `https://storage.test/${path}`),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockListing = {
  id: 'listing-1',
  vendor_id: 'vendor-1',
  title: 'Test Listing',
  description: 'A test service',
  price: 100,
  price_unit: 'fixed',
  status: ListingStatus.DRAFT,
  location: 'New York',
  availability: null,
  delivery_time: null,
  tags: ['test'],
  images: [],
  category: { id: 'cat-1', name: 'Photography' },
  sub_category: null,
  deleted_at: null,
  vendor: null,
  reviews: [],
  _count: { bookings: 0, reviews: 0 },
};

const mockPrisma = {
  vendorListing: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  listingAvailability: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('VendorListingService', () => {
  let service: VendorListingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorListingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VendorListingService>(VendorListingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a listing with no images', async () => {
      mockPrisma.vendorListing.create.mockResolvedValue(mockListing);

      const result = await service.create('vendor-1', {
        title: 'Test Listing',
        description: 'A test service',
        price: 100,
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.vendorListing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendor_id: 'vendor-1',
            title: 'Test Listing',
            status: ListingStatus.DRAFT,
          }),
        }),
      );
    });
  });

  describe('findMyListings', () => {
    it('should return paginated listings for vendor', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(2);
      mockPrisma.vendorListing.findMany.mockResolvedValue([mockListing, { ...mockListing, id: 'listing-2' }]);

      const result = await service.findMyListings('vendor-1', { page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockPrisma.vendorListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vendor_id: 'vendor-1' }),
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(1);
      mockPrisma.vendorListing.findMany.mockResolvedValue([{ ...mockListing, status: ListingStatus.ACTIVE }]);

      await service.findMyListings('vendor-1', { status: ListingStatus.ACTIVE });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ListingStatus.ACTIVE }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a listing by id', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);

      const result = await service.findOne('listing-1', 'vendor-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException for missing listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      await expect(service.findOne('bad-id', 'vendor-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when vendorId does not match', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);

      await expect(service.findOne('listing-1', 'other-vendor')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update listing fields', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.vendorListing.update.mockResolvedValue({
        ...mockListing,
        title: 'Updated Title',
      });

      const result = await service.update('listing-1', 'vendor-1', { title: 'Updated Title' });
      expect(result.success).toBe(true);
      expect(mockPrisma.vendorListing.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when wrong vendor updates', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);

      await expect(
        service.update('listing-1', 'wrong-vendor', { title: 'Hack' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, deleted_at: new Date() });

      const result = await service.remove('listing-1', 'vendor-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.vendorListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
    });
  });

  describe('publishListing', () => {
    it('should reject publishing a listing with no images', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: [] });

      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow();
    });

    it('should publish a listing that has images', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['img.jpg'] });
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, status: ListingStatus.ACTIVE });

      const result = await service.publishListing('listing-1', 'vendor-1');
      expect(result.success).toBe(true);
    });
  });

  describe('pauseListing', () => {
    it('pauses an active listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, status: ListingStatus.ACTIVE });
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, status: ListingStatus.PAUSED });

      const res = await service.pauseListing('listing-1', 'vendor-1');

      expect(res.data.status).toBe(ListingStatus.PAUSED);
    });

    it('refuses to pause a non-active listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      await expect(service.pauseListing('listing-1', 'vendor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('availability', () => {
    const range = { start_date: new Date('2026-12-20'), end_date: new Date('2026-12-27'), reason: 'Holiday' };

    it('blocks a date range for the owning vendor', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.listingAvailability.create.mockResolvedValue({ id: 'blk-1', listing_id: 'listing-1', ...range });

      const res = await service.blockDates('listing-1', 'vendor-1', range);

      expect(res.data.id).toBe('blk-1');
      expect(mockPrisma.listingAvailability.create).toHaveBeenCalledWith({
        data: { listing_id: 'listing-1', ...range },
      });
    });

    it('rejects an inverted date range', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      await expect(
        service.blockDates('listing-1', 'vendor-1', { start_date: range.end_date, end_date: range.start_date }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects blocking dates on another vendor\'s listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      await expect(service.blockDates('listing-1', 'vendor-2', range)).rejects.toThrow(ForbiddenException);
    });

    it('unblocks dates only for the owning vendor', async () => {
      mockPrisma.listingAvailability.findUnique.mockResolvedValue({ id: 'blk-1', listing: { vendor_id: 'vendor-1' } });

      await expect(service.unblockDates('blk-1', 'vendor-2')).rejects.toThrow(ForbiddenException);
      await service.unblockDates('blk-1', 'vendor-1');

      expect(mockPrisma.listingAvailability.delete).toHaveBeenCalledWith({ where: { id: 'blk-1' } });
    });

    it('404s when the block does not exist', async () => {
      mockPrisma.listingAvailability.findUnique.mockResolvedValue(null);
      await expect(service.unblockDates('nope', 'vendor-1')).rejects.toThrow(NotFoundException);
    });
  });
});
