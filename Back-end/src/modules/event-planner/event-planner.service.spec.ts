import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventPlannerService } from './event-planner.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ADMIN_APPROVE_STATUS } from 'prisma/generated/client';
import { TanvirStorage } from 'src/common/lib/Disk/TanvirStorage';
import { PrivateStorage, SignedUrl } from 'src/modules/contracts/private-storage';

jest.mock('src/common/lib/Disk/TanvirStorage', () => ({
  TanvirStorage: {
    put: jest.fn().mockResolvedValue(undefined),
    url: jest.fn((path: string) => `https://storage.test/${path}`),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('src/modules/contracts/private-storage', () => {
  const actual = jest.requireActual('src/modules/contracts/private-storage');
  return { ...actual, PrivateStorage: { ...actual.PrivateStorage, put: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) } };
});

const tokenOf = (url: string) => SignedUrl.verify(url.split('/').pop()!);

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
  user: { findUnique: jest.fn().mockResolvedValue({ deleted_at: null, status: 1 }) },
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
    const dto = { business_name: 'Events by Jane', bio: 'b', event_types: ['WEDDING'], years_experience: 5 } as any;
    const jpg = { originalname: 'me.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) } as Express.Multer.File;
    const pdf = { originalname: 'licence <script>.pdf', buffer: Buffer.from('%PDF-1.4\n') } as Express.Multer.File;
    const html = { originalname: 'licence.pdf', buffer: Buffer.from('<html></html>') } as Express.Multer.File;

    it('takes photos or PDFs as licences, kept in private storage under random per-planner keys', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(null);
      mockPrisma.eventPlannerProfile.upsert.mockImplementation(({ create }: any) => Promise.resolve({ ...mockProfile, ...create }));
      const res: any = await service.upsertProfile('user-1', dto, [jpg], [jpg, pdf]);
      const { create } = mockPrisma.eventPlannerProfile.upsert.mock.calls[0][0];
      expect(create.portfolio).toEqual([expect.stringMatching(/^[0-9a-f]{24}\.jpg$/)]);
      expect(create.license_photo).toEqual([
        expect.stringMatching(/^licences\/planner\/user-1\/\d+-[0-9a-f]{24}\.jpg$/),
        expect.stringMatching(/^licences\/planner\/user-1\/\d+-[0-9a-f]{24}\.pdf$/),
      ]);
      expect(PrivateStorage.put).toHaveBeenCalledTimes(2);
      expect(TanvirStorage.put).not.toHaveBeenCalledWith(expect.stringContaining('license'), expect.anything());
      // the planner gets signed links to their own files
      expect(tokenOf(res.data.license_photo[0])).toMatchObject({ key: create.license_photo[0], uid: 'user-1', cid: 'user-1' });
    });

    it('removes the licences it replaces once the profile is saved, and keeps them if saving fails', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue({ license_photo: ['old.pdf', 'licences/planner/user-1/1-a.pdf'] });
      mockPrisma.eventPlannerProfile.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(service.upsertProfile('user-1', dto, undefined, [pdf])).rejects.toThrow('db down');
      expect(TanvirStorage.delete).not.toHaveBeenCalled();
      expect(PrivateStorage.remove).toHaveBeenCalledWith((PrivateStorage.put as jest.Mock).mock.calls[0][0]);
      expect(PrivateStorage.remove).not.toHaveBeenCalledWith('licences/planner/user-1/1-a.pdf');

      mockPrisma.eventPlannerProfile.upsert.mockResolvedValue(mockProfile);
      await service.upsertProfile('user-1', dto, undefined, [pdf]);
      expect(TanvirStorage.delete).toHaveBeenCalledWith('event-planner/license/old.pdf');
      expect(PrivateStorage.remove).toHaveBeenCalledWith('licences/planner/user-1/1-a.pdf');
    });

    it('refuses a PDF in the portfolio or a web page as a licence, before removing anything', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue({ portfolio: ['old.jpg'] });
      await expect(service.upsertProfile('user-1', dto, [pdf])).rejects.toThrow(BadRequestException);
      await expect(service.upsertProfile('user-1', dto, [jpg], [html])).rejects.toThrow(BadRequestException);
      expect(TanvirStorage.delete).not.toHaveBeenCalled();
      expect(TanvirStorage.put).not.toHaveBeenCalled();
      expect(mockPrisma.eventPlannerProfile.upsert).not.toHaveBeenCalled();
    });

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

    it('gives the planner signed links to their own licences, old public ones included', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue({ ...mockProfile, license_photo: ['old.pdf', 'licences/planner/user-1/1-a.pdf'] });
      const { data } = await service.getMyProfile('user-1');
      expect(data.license_photo.map((u: string) => tokenOf(u)?.key)).toEqual(['licences/legacy/planner/old.pdf', 'licences/planner/user-1/1-a.pdf']);
      expect(JSON.stringify(data)).not.toContain('storage.test/event-planner/license');
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

    it('hides a suspended or deleted planner', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue(mockProfile);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ deleted_at: null, status: 0 });
      await expect(service.getPublicProfile('user-1')).rejects.toThrow(NotFoundException);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ deleted_at: new Date(), status: 1 });
      await expect(service.getPublicProfile('user-1')).rejects.toThrow(NotFoundException);
    });

    it('never shows the licence documents publicly', async () => {
      mockPrisma.eventPlannerProfile.findUnique.mockResolvedValue({ ...mockProfile, license_photo: ['licence.pdf'] });
      const one: any = await service.getPublicProfile('user-1');
      expect(one.data).not.toHaveProperty('license_photo');
      expect(JSON.stringify(one)).not.toMatch(/licence\.pdf|licence-files/);
      mockPrisma.eventPlannerProfile.findMany.mockResolvedValue([{ ...mockProfile, license_photo: ['licence.pdf'] }]);
      mockPrisma.eventPlannerProfile.count.mockResolvedValue(1);
      const list: any = await service.listApprovedPlanners({});
      expect(list.data[0]).not.toHaveProperty('license_photo');
      expect(JSON.stringify(list)).not.toMatch(/licence\.pdf|licence-files/);
    });

    it('gives admins signed links in the pending queue', async () => {
      mockPrisma.eventPlannerProfile.findMany.mockResolvedValue([{ ...mockProfile, license_photo: ['licences/planner/user-1/1-a.pdf'] }]);
      mockPrisma.eventPlannerProfile.count.mockResolvedValue(1);
      const res: any = await service.getPendingPlanners({}, 'admin-1');
      expect(tokenOf(res.data[0].license_photo[0])).toMatchObject({ key: 'licences/planner/user-1/1-a.pdf', uid: 'admin-1', cid: 'user-1' });
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
