import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventPlannerService } from './event-planner.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ADMIN_APPROVE_STATUS } from 'prisma/generated/client';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    put: jest.fn().mockResolvedValue(undefined),
    url: jest.fn((path: string) => `https://storage.test/${path}`),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockProfile = {
  id: 'ep-1',
  user_id: 'user-1',
  business_name: 'Events by Jane',
  bio: 'Professional event planner',
  event_types: ['WEDDING', 'CORPORATE'],
  years_experience: 5,
  team_size: 3,
  portfolio: [],
  license_photo: [],
  license_status: ADMIN_APPROVE_STATUS.APPROVED,
  website: null,
  instagram: null,
  user: { id: 'user-1', name: 'Jane Doe', email: 'jane@test.com', avatar: null },
};

const mockPrisma = {
  eventPlannerProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('EventPlannerService', () => {
  let service: EventPlannerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPlannerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EventPlannerService>(EventPlannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertProfile', () => {
    it('should create or update a profile', async () => {
      mockPrisma.eventPlannerProfile.upsert.mockResolvedValue(mockProfile);

      const result = await service.upsertProfile('user-1', {
        business_name: 'Events by Jane',
        bio: 'Professional event planner',
        event_types: ['WEDDING'],
        years_experience: 5,
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.eventPlannerProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          create: expect.objectContaining({ user_id: 'user-1' }),
        }),
      );
    });
  });

  describe('getMyProfile', () => {
    it('should return the profile for the authenticated user', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getMyProfile('user-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('no-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('should return approved profile publicly', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(mockProfile);

      const result = await service.getPublicProfile('user-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException when profile not approved', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue({
        ...mockProfile,
        license_status: ADMIN_APPROVE_STATUS.PENDING,
      });

      await expect(service.getPublicProfile('user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(null);

      await expect(service.getPublicProfile('no-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listApprovedPlanners', () => {
    it('should return paginated list of approved planners', async () => {
      mockPrisma.eventPlannerProfile.count.mockResolvedValue(1);
      mockPrisma.eventPlannerProfile.findMany.mockResolvedValue([mockProfile]);

      const result = await service.listApprovedPlanners({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by event_type', async () => {
      mockPrisma.eventPlannerProfile.count.mockResolvedValue(1);
      mockPrisma.eventPlannerProfile.findMany.mockResolvedValue([mockProfile]);

      await service.listApprovedPlanners({ event_type: 'WEDDING' });

      expect(mockPrisma.eventPlannerProfile.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event_types: { has: 'WEDDING' },
          }),
        }),
      );
    });
  });

  describe('updateApprovalStatus', () => {
    it('should update approval status', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.eventPlannerProfile.update.mockResolvedValue({
        ...mockProfile,
        license_status: ADMIN_APPROVE_STATUS.SUSPENDED,
      });

      const result = await service.updateApprovalStatus('user-1', ADMIN_APPROVE_STATUS.SUSPENDED);
      expect(result.success).toBe(true);
      expect(mockPrisma.eventPlannerProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ license_status: ADMIN_APPROVE_STATUS.SUSPENDED }),
        }),
      );
    });

    it('should throw NotFoundException for unknown user', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateApprovalStatus('no-user', ADMIN_APPROVE_STATUS.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
