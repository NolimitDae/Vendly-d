import { Test, TestingModule } from '@nestjs/testing';
import { ListingService } from './listing.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockListing = {
  id: 'listing-1',
  title: 'Wedding Photography',
  description: 'Professional wedding photographer',
  status: 'ACTIVE',
  deleted_at: null,
  created_at: new Date('2024-01-01'),
  vendor: { id: 'vendor-1', name: 'Alice', email: 'alice@test.com' },
  category: { id: 'cat-1', name: 'Photography' },
  _count: { bookings: 3, reviews: 5 },
};

const mockPrisma = {
  vendorListing: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('ListingService', () => {
  let service: ListingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ListingService>(ListingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated listings with meta', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(1);
      mockPrisma.vendorListing.findMany.mockResolvedValue([mockListing]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
      );
      expect(mockPrisma.vendorListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { created_at: 'desc' },
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, last_page: 1 });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 10, status: 'ACTIVE' as any });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should apply search filter across title and description', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'wedding' });

      expect(mockPrisma.vendorListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'wedding', mode: 'insensitive' } },
              { description: { contains: 'wedding', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should default to page 1 and limit 20 when not provided', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);

      const result = await service.findAll({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should return empty data array when no listings match', async () => {
      mockPrisma.vendorListing.count.mockResolvedValue(0);
      mockPrisma.vendorListing.findMany.mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20, status: 'INACTIVE' as any });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('should update listing status and return updated listing', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      const updatedListing = { ...mockListing, status: 'INACTIVE' };
      mockPrisma.vendorListing.update.mockResolvedValue(updatedListing);

      const result = await service.updateStatus('listing-1', 'INACTIVE' as any);

      expect(mockPrisma.vendorListing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'listing-1', deleted_at: null } }),
      );
      expect(mockPrisma.vendorListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-1' },
          data: { status: 'INACTIVE' },
        }),
      );
      expect(result.success).toBe(true);
      expect((result as any).data.status).toBe('INACTIVE');
    });

    it('should return failure when listing is not found', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      const result = await service.updateStatus('bad-id', 'ACTIVE' as any);

      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Listing not found');
    });
  });

  describe('remove', () => {
    it('should soft-delete listing by setting deleted_at and return success', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, deleted_at: new Date() });

      const result = await service.remove('listing-1');

      expect(mockPrisma.vendorListing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'listing-1', deleted_at: null } }),
      );
      expect(mockPrisma.vendorListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-1' },
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Listing removed');
    });

    it('should return failure when listing is not found', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue(null);

      const result = await service.remove('bad-id');

      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Listing not found');
    });
  });
});
