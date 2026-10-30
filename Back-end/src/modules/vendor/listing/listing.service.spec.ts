import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { depositColumns, VendorListingService } from './listing.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListingStatus, PaymentPlan } from 'prisma/generated/client';
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
  serviceSubCategory: { findUnique: jest.fn() },
  vendorProfile: { findUnique: jest.fn() },
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
    mockPrisma.vendorProfile.findUnique.mockResolvedValue({ license_status: 'APPROVED', license_photo: ['l.pdf'], business_address: '1 Main St, Austin, TX' });
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

  describe('a package\'s own deposit', () => {
    it('keeps the numbers a custom deposit needs, and none for any other plan', () => {
      expect(depositColumns(PaymentPlan.DEPOSIT_CUSTOM, { deposit_percent: 30, balance_after_service: true })).toEqual({ deposit_percent: 30, balance_due_days: null, balance_after_service: true });
      expect(depositColumns(PaymentPlan.DEPOSIT_CUSTOM, { deposit_percent: 40, balance_due_days: 10 })).toEqual({ deposit_percent: 40, balance_due_days: 10, balance_after_service: false });
      expect(depositColumns(PaymentPlan.DEPOSIT_50, { deposit_percent: 40, balance_due_days: 10 })).toEqual({ deposit_percent: null, balance_due_days: null, balance_after_service: false });
      // a change to one number keeps the saved others
      expect(depositColumns(PaymentPlan.DEPOSIT_CUSTOM, { deposit_percent: 60 }, { deposit_percent: 30, balance_due_days: 5, balance_after_service: false })).toEqual({ deposit_percent: 60, balance_due_days: 5, balance_after_service: false });
    });

    it('asks for the percentage and for when the balance is due', () => {
      expect(() => depositColumns(PaymentPlan.DEPOSIT_CUSTOM, { balance_after_service: true })).toThrow('Choose the deposit');
      expect(() => depositColumns(PaymentPlan.DEPOSIT_CUSTOM, { deposit_percent: 30 })).toThrow('Choose when the balance is due');
    });
  });

  describe('location and service radius', () => {
    it('stores a picked place with its position and travel radius, without geocoding', async () => {
      mockPrisma.vendorListing.create.mockResolvedValue({ ...mockListing, location: 'Austin, TX', lat: 30.27, lng: -97.74 });
      await service.create('vendor-1', { title: 'DJ', description: 'x', price: 100, location: 'Austin, TX', lat: 30.27, lng: -97.74, service_radius_miles: 50 });
      expect(mockPrisma.vendorListing.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ location: 'Austin, TX', lat: 30.27, lng: -97.74, geocoded_at: expect.any(Date), service_radius_miles: 50 }) }),
      );
    });

    it('ignores coordinates sent without a location, and clears old ones when the location is retyped', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, location: null });
      mockPrisma.vendorListing.update.mockResolvedValue(mockListing);
      await service.update('listing-1', 'vendor-1', { lat: 1, lng: 2 } as any);
      expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).not.toHaveProperty('lat');

      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, location: 'Austin, TX' });
      await service.update('listing-1', 'vendor-1', { location: 'Dallas, TX' });
      expect(mockPrisma.vendorListing.update.mock.calls[1][0].data).toMatchObject({ location: 'Dallas, TX', lat: null, lng: null, geocoded_at: null });

      await service.update('listing-1', 'vendor-1', { location: 'Dallas, TX', lat: 32.78, lng: -96.8 });
      expect(mockPrisma.vendorListing.update.mock.calls[2][0].data).toMatchObject({ location: 'Dallas, TX', lat: 32.78, lng: -96.8, geocoded_at: expect.any(Date) });
    });
  });

  describe('category and sub-category', () => {
    it('refuses a sub-category from another category', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue({ category_id: 'cat-music' });
      await expect(service.create('vendor-1', { title: 'DJ', description: 'x', price: 100, category_id: 'cat-food', sub_category_id: 'sub-dj' })).rejects.toThrow('doesn’t belong');
      expect(mockPrisma.vendorListing.create).not.toHaveBeenCalled();
    });

    it('drops the old sub-category when only the category changes', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, category_id: 'cat-music', sub_category_id: 'sub-dj' });
      mockPrisma.vendorListing.update.mockResolvedValue(mockListing);
      await service.update('listing-1', 'vendor-1', { category_id: 'cat-food' });
      expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).toMatchObject({ category_id: 'cat-food', sub_category_id: null });
    });

    it('an empty sub-category clears it ("Any type")', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, category_id: 'cat-music', sub_category_id: 'sub-dj' });
      mockPrisma.vendorListing.update.mockResolvedValue(mockListing);
      await service.update('listing-1', 'vendor-1', { category_id: 'cat-music', sub_category_id: '' });
      expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).toMatchObject({ category_id: 'cat-music', sub_category_id: null });
    });

    it('a sub-category on its own brings its category with it', async () => {
      mockPrisma.serviceSubCategory.findUnique.mockResolvedValue({ category_id: 'cat-music' });
      mockPrisma.vendorListing.create.mockResolvedValue(mockListing);
      await service.create('vendor-1', { title: 'DJ', description: 'x', price: 100, sub_category_id: 'sub-dj' });
      expect(mockPrisma.vendorListing.create.mock.calls[0][0].data).toMatchObject({ category_id: 'cat-music', sub_category_id: 'sub-dj' });

      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, category_id: null, sub_category_id: null });
      mockPrisma.vendorListing.update.mockResolvedValue(mockListing);
      await service.update('listing-1', 'vendor-1', { sub_category_id: 'sub-dj' });
      expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).toMatchObject({ category_id: 'cat-music', sub_category_id: 'sub-dj' });
    });

    it('an empty category clears both', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, category_id: 'cat-music', sub_category_id: 'sub-dj' });
      mockPrisma.vendorListing.update.mockResolvedValue(mockListing);
      await service.update('listing-1', 'vendor-1', { category_id: '' });
      expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).toMatchObject({ category_id: null, sub_category_id: null });
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

  describe('listing photos', () => {
    const jpg = { originalname: '../../index.html', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;
    const fake = { originalname: 'photo.jpg', buffer: Buffer.from('<html><script>alert(1)</script>') } as Express.Multer.File;

    it('stores photos under random names with their real extension', async () => {
      mockPrisma.vendorListing.create.mockResolvedValue(mockListing);
      await service.create('vendor-1', { title: 'T', description: 'D', price: 1 }, [jpg]);
      const images = mockPrisma.vendorListing.create.mock.calls[0][0].data.images;
      expect(images).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.jpg$/)]);
      expect(TanvirStorage.put).toHaveBeenCalledWith(`listings/${images[0]}`, jpg.buffer);
    });

    it('refuses a file that is not really a photo, and keeps the old photos', async () => {
      await expect(service.create('vendor-1', { title: 'T', description: 'D', price: 1 }, [fake])).rejects.toThrow(BadRequestException);
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['old.jpg'] });
      await expect(service.update('listing-1', 'vendor-1', {}, [jpg, fake])).rejects.toThrow(BadRequestException);
      expect(TanvirStorage.delete).not.toHaveBeenCalled();
      expect(TanvirStorage.put).not.toHaveBeenCalled();
      expect(mockPrisma.vendorListing.create).not.toHaveBeenCalled();
    });

    it('replacing photos deletes the old ones only after the listing is saved', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['old.jpg'] });
      const order: string[] = [];
      (TanvirStorage.put as jest.Mock).mockImplementation(async (key: string) => void order.push(`put ${key}`));
      (TanvirStorage.delete as jest.Mock).mockImplementation(async (key: string) => void order.push(`delete ${key}`));
      mockPrisma.vendorListing.update.mockImplementation(async ({ data }: any) => {
        order.push('save');
        return { ...mockListing, images: data.images };
      });
      await service.update('listing-1', 'vendor-1', {}, [jpg]);
      const [name] = mockPrisma.vendorListing.update.mock.calls[0][0].data.images;
      expect(order).toEqual([`put listings/${name}`, 'save', 'delete listings/old.jpg']);
    });

    it('keeps the old photos and drops the new ones when the save fails', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['old.jpg'] });
      (TanvirStorage.put as jest.Mock).mockResolvedValue(undefined);
      (TanvirStorage.delete as jest.Mock).mockResolvedValue(undefined);
      mockPrisma.vendorListing.update.mockRejectedValueOnce(new Error('db down'));
      await expect(service.update('listing-1', 'vendor-1', {}, [jpg, jpg])).rejects.toThrow('db down');
      const stored = (TanvirStorage.put as jest.Mock).mock.calls.map((c) => c[0]);
      expect(stored).toHaveLength(2);
      expect((TanvirStorage.delete as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual([...stored].sort());
      expect(TanvirStorage.delete).not.toHaveBeenCalledWith('listings/old.jpg');
    });

    describe('keep_images', () => {
      const track = () => {
        const order: string[] = [];
        (TanvirStorage.put as jest.Mock).mockImplementation(async (key: string) => void order.push(`put ${key}`));
        (TanvirStorage.delete as jest.Mock).mockImplementation(async (key: string) => void order.push(`delete ${key}`));
        mockPrisma.vendorListing.update.mockImplementation(async ({ data }: any) => {
          order.push('save');
          return { ...mockListing, images: data.images ?? [] };
        });
        return order;
      };

      it('keeps the photos the vendor kept, adds the new ones after them, and deletes only the dropped one after saving', async () => {
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['a.jpg', 'b.jpg', 'c.jpg'] });
        const order = track();
        // the apps send back the URLs they were shown
        await service.update('listing-1', 'vendor-1', { keep_images: ['https://cdn.test/listings/c.jpg?v=1', 'a.jpg'] }, [jpg]);
        const images = mockPrisma.vendorListing.update.mock.calls[0][0].data.images;
        expect(images).toEqual(['c.jpg', 'a.jpg', expect.stringMatching(/^[0-9a-f]{24}\.jpg$/)]);
        expect(mockPrisma.vendorListing.update.mock.calls[0][0].data).not.toHaveProperty('keep_images');
        expect(order).toEqual([`put listings/${images[2]}`, 'save', 'delete listings/b.jpg']);
      });

      it('removes a photo without adding any', async () => {
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['a.jpg', 'b.jpg'] });
        const order = track();
        await service.update('listing-1', 'vendor-1', { keep_images: ['b.jpg'] });
        expect(mockPrisma.vendorListing.update.mock.calls[0][0].data.images).toEqual(['b.jpg']);
        expect(order).toEqual(['save', 'delete listings/a.jpg']);
      });

      it("ignores names that aren't this listing's photos", async () => {
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['a.jpg'] });
        track();
        await service.update('listing-1', 'vendor-1', { keep_images: ['a.jpg', '../other/secret.jpg', 'someone-else.jpg'] });
        expect(mockPrisma.vendorListing.update.mock.calls[0][0].data.images).toEqual(['a.jpg']);
        expect(TanvirStorage.delete).not.toHaveBeenCalled();
      });

      it('refuses more than 10 photos in all, and a published package with none', async () => {
        const ten = Array.from({ length: 10 }, (_, i) => `p${i}.jpg`);
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ten });
        await expect(service.update('listing-1', 'vendor-1', { keep_images: ten }, [jpg])).rejects.toThrow(BadRequestException);
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, status: ListingStatus.ACTIVE, images: ['a.jpg'] });
        await expect(service.update('listing-1', 'vendor-1', { keep_images: [] })).rejects.toThrow(BadRequestException);
        expect(TanvirStorage.put).not.toHaveBeenCalled();
        expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
      });

      it('without keep_images, new photos still replace all the old ones (older apps)', async () => {
        mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['a.jpg', 'b.jpg'] });
        const order = track();
        await service.update('listing-1', 'vendor-1', {}, [jpg]);
        const [name] = mockPrisma.vendorListing.update.mock.calls[0][0].data.images;
        expect(order).toEqual([`put listings/${name}`, 'save', 'delete listings/a.jpg', 'delete listings/b.jpg']);
      });
    });

    it('drops the photos already stored when storing one of them fails', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['old.jpg'] });
      (TanvirStorage.put as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
      (TanvirStorage.delete as jest.Mock).mockResolvedValue(undefined);
      await expect(service.update('listing-1', 'vendor-1', {}, [jpg, jpg])).rejects.toThrow('disk full');
      const first = (TanvirStorage.put as jest.Mock).mock.calls[0][0];
      expect(TanvirStorage.delete).toHaveBeenCalledTimes(1);
      expect(TanvirStorage.delete).toHaveBeenCalledWith(first);
      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
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

  describe('licence needed to publish', () => {
    const NEEDS = /business licence needs to be approved before you can publish/;

    it('refuses to publish until the licence is approved, and says why', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['img.jpg'] });
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'PENDING', license_photo: [] });
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(NEEDS);
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'PENDING', license_photo: ['l.pdf'] });
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(/Vendly is reviewing your business licence/);
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'SUSPENDED', license_photo: ['l.pdf'] });
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(/needs attention/);
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce(null);
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
      expect(mockPrisma.vendorProfile.findUnique).toHaveBeenCalledWith({ where: { user_id: 'vendor-1' }, select: { license_status: true, license_photo: true } });
    });

    it('needs a business address on file to publish', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['img.jpg'] });
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'APPROVED', license_photo: ['l.pdf'] }).mockResolvedValueOnce({ business_address: '  ' });
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(/Add your business address in your profile before you publish/);
      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
    });

    it('lets vendors who need no licence publish', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, images: ['img.jpg'] });
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, status: ListingStatus.ACTIVE });
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'NOT_APPLICABLE', license_photo: [] });
      await expect(service.publishListing('listing-1', 'vendor-1')).resolves.toMatchObject({ success: true });
    });

    it('refuses re-publishing a paused package too', async () => {
      mockPrisma.vendorListing.findFirst.mockResolvedValue({ ...mockListing, status: ListingStatus.PAUSED, images: ['img.jpg'] });
      mockPrisma.vendorProfile.findUnique.mockResolvedValueOnce({ license_status: 'PENDING', license_photo: [] });
      await expect(service.publishListing('listing-1', 'vendor-1')).rejects.toThrow(NEEDS);
    });

    it('refuses creating a live package, but saves a draft', async () => {
      mockPrisma.vendorProfile.findUnique.mockResolvedValue({ license_status: 'PENDING', license_photo: [] });
      const dto = { title: 'Live now', description: 'x', price: 100 };
      await expect(service.create('vendor-1', { ...dto, status: ListingStatus.ACTIVE })).rejects.toThrow(NEEDS);
      expect(mockPrisma.vendorListing.create).not.toHaveBeenCalled();
      mockPrisma.vendorListing.create.mockResolvedValue(mockListing);
      await expect(service.create('vendor-1', dto)).resolves.toMatchObject({ success: true });
      expect(mockPrisma.vendorListing.create.mock.calls[0][0].data.status).toBe(ListingStatus.DRAFT);
    });

    it('refuses setting a draft live through an edit, but other edits save', async () => {
      mockPrisma.vendorProfile.findUnique.mockResolvedValue({ license_status: 'PENDING', license_photo: [] });
      mockPrisma.vendorListing.findFirst.mockResolvedValue(mockListing);
      await expect(service.update('listing-1', 'vendor-1', { status: ListingStatus.ACTIVE })).rejects.toThrow(NEEDS);
      expect(mockPrisma.vendorListing.update).not.toHaveBeenCalled();
      mockPrisma.vendorListing.update.mockResolvedValue({ ...mockListing, title: 'New' });
      await expect(service.update('listing-1', 'vendor-1', { title: 'New' })).resolves.toMatchObject({ success: true });
    });

    it('keeps a package that is already live live, edits included', async () => {
      mockPrisma.vendorProfile.findUnique.mockResolvedValue({ license_status: 'PENDING', license_photo: [] });
      const live = { ...mockListing, status: ListingStatus.ACTIVE, images: ['img.jpg'] };
      mockPrisma.vendorListing.findFirst.mockResolvedValue(live);
      mockPrisma.vendorListing.update.mockResolvedValue(live);
      await expect(service.update('listing-1', 'vendor-1', { title: 'Still live', status: ListingStatus.ACTIVE })).resolves.toMatchObject({ success: true });
      await expect(service.publishListing('listing-1', 'vendor-1')).resolves.toMatchObject({ success: true });
      expect(mockPrisma.vendorProfile.findUnique).not.toHaveBeenCalled();
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
