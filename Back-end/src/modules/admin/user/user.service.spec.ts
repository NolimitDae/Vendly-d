import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRepository } from 'src/common/repository/user/user.repository';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    url: jest.fn((path: string) => `https://cdn.example.com/${path}`),
  },
}));

jest.mock('src/config/app.config', () => ({
  default: jest.fn(() => ({
    storageUrl: {
      avatar: 'avatars',
      license: 'licenses',
    },
  })),
}));

const mockVendorUser = {
  id: 'vendor-1',
  email: 'vendor@test.com',
  first_name: 'Alice',
  last_name: 'Smith',
  name: 'Alice Smith',
  type: 'VENDOR',
  avatar: null,
  created_at: new Date('2024-01-01'),
  vendorProfile: {
    business_name: 'Alice Events',
    license_photo: ['photo1.jpg'],
    license_status: 'PENDING',
    about_me: 'Event vendor',
    address: '123 Main St',
    created_at: new Date('2024-01-01'),
  },
  _count: { vendorListings: 3, vendorBookings: 5 },
};

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  vendorProfile: {
    update: jest.fn(),
  },
};

const mockUserRepository = {
  getUserDetails: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPendingLicense', () => {
    it('should return mapped pending license users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockVendorUser]);

      const result = await service.getPendingLicense();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorProfile: expect.objectContaining({ license_status: 'PENDING' }),
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('vendor-1');
      expect(result[0].license_status).toBe('PENDING');
    });

    it('should return empty array when no pending users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getPendingLicense();

      expect(result).toEqual([]);
    });

    it('should handle users with no license photos', async () => {
      const userNoPhoto = {
        ...mockVendorUser,
        vendorProfile: { ...mockVendorUser.vendorProfile, license_photo: null },
      };
      mockPrisma.user.findMany.mockResolvedValue([userNoPhoto]);

      const result = await service.getPendingLicense();

      expect(result[0].license_photo).toEqual([]);
    });
  });

  describe('getApprovedLicense', () => {
    it('should return mapped approved license users', async () => {
      const approvedUser = {
        ...mockVendorUser,
        vendorProfile: { ...mockVendorUser.vendorProfile, license_status: 'APPROVED' },
      };
      mockPrisma.user.findMany.mockResolvedValue([approvedUser]);

      const result = await service.getApprovedLicense();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorProfile: expect.objectContaining({ license_status: 'APPROVED' }),
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].license_status).toBe('APPROVED');
    });

    it('should return empty array when no approved users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getApprovedLicense();

      expect(result).toEqual([]);
    });
  });

  describe('getVendors', () => {
    it('should return paginated vendors with meta', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([mockVendorUser]);

      const result = await service.getVendors({ page: 1, limit: 20 });

      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { type: 'VENDOR' } }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, last_page: 1 });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getVendors({ page: 1, limit: 10, status: 'APPROVED' });

      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: 'VENDOR', vendorProfile: { license_status: 'APPROVED' } },
        }),
      );
    });

    it('should default to page 1 and limit 20', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getVendors({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('approveLicense', () => {
    it('should approve license and return success response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockVendorUser,
        vendorProfile: mockVendorUser.vendorProfile,
      });
      mockPrisma.vendorProfile.update.mockResolvedValue({
        license_status: 'APPROVED',
      });

      const result = await service.approveLicense({ licenseStatus: 'APPROVED' }, 'vendor-1');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'vendor-1' } }),
      );
      expect(mockPrisma.vendorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { license_status: 'PENDING', user_id: 'vendor-1' },
          data: expect.objectContaining({ license_status: 'APPROVED' }),
        }),
      );
      expect(result.sucess).toBe(true);
      expect(result.data.licenseStatus).toBe('APPROVED');
    });

    it('should throw Error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.approveLicense({ licenseStatus: 'APPROVED' }, 'bad-id'),
      ).rejects.toThrow('User not found or does not have a vendor profile');
    });

    it('should throw Error when vendor profile is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockVendorUser,
        vendorProfile: null,
      });

      await expect(
        service.approveLicense({ licenseStatus: 'APPROVED' }, 'vendor-1'),
      ).rejects.toThrow('User not found or does not have a vendor profile');
    });
  });
});
