import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AdminPlannersService } from './admin-planners.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockUserService = {
  getVendors: jest.fn(),
  getPendingLicense: jest.fn(),
  getApprovedLicense: jest.fn(),
  approveLicense: jest.fn(),
};

const mockPlanners = { list: jest.fn(), detail: jest.fn() };

const mockPendingList = [
  {
    id: 'vendor-1',
    email: 'vendor@test.com',
    name: 'Alice Smith',
    license_status: 'PENDING',
    license_photo: [],
  },
];

const mockApprovedList = [
  {
    id: 'vendor-2',
    email: 'vendor2@test.com',
    name: 'Bob Jones',
    license_status: 'APPROVED',
    license_photo: [],
  },
];

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: AdminPlannersService, useValue: mockPlanners },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('planners', () => {
    it('passes the status filter and search through', async () => {
      mockPlanners.list.mockResolvedValue({ success: true, data: [] });
      await controller.getPlanners('suspended', 'jane', 1, 50);
      expect(mockPlanners.list).toHaveBeenCalledWith({ status: 'suspended', search: 'jane', page: 1, limit: 50 });
    });

    it('returns one planner', async () => {
      mockPlanners.detail.mockResolvedValue({ success: true, data: { id: 'p1' } });
      await expect(controller.getPlanner('p1', 'admin-1')).resolves.toEqual({ success: true, data: { id: 'p1' } });
      expect(mockPlanners.detail).toHaveBeenCalledWith('p1', 'admin-1');
    });
  });

  describe('getVendors', () => {
    it('should call service.getVendors with query params and return result', async () => {
      const expected = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 20, last_page: 0 },
      };
      mockUserService.getVendors.mockResolvedValue(expected);

      const result = await controller.getVendors(1, 20, 'APPROVED');

      expect(mockUserService.getVendors).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: 'APPROVED',
      });
      expect(result).toEqual(expected);
    });

    it('should call service.getVendors with undefined query params when not provided', async () => {
      mockUserService.getVendors.mockResolvedValue({ success: true, data: [], meta: {} });

      await controller.getVendors(undefined, undefined, undefined);

      expect(mockUserService.getVendors).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        status: undefined,
      });
    });
  });

  describe('getPendingLicense', () => {
    it('should return pending license list from service', async () => {
      mockUserService.getPendingLicense.mockResolvedValue(mockPendingList);

      const result = await controller.getPendingLicense('admin-1');

      expect(mockUserService.getPendingLicense).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual(mockPendingList);
    });

    it('should return empty array when no pending licenses', async () => {
      mockUserService.getPendingLicense.mockResolvedValue([]);

      const result = await controller.getPendingLicense('admin-1');

      expect(result).toEqual([]);
    });
  });

  describe('getApprovedLicense', () => {
    it('should return approved license list from service', async () => {
      mockUserService.getApprovedLicense.mockResolvedValue(mockApprovedList);

      const result = await controller.getApprovedLicense('admin-1');

      expect(mockUserService.getApprovedLicense).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual(mockApprovedList);
    });

    it('should return empty array when no approved licenses', async () => {
      mockUserService.getApprovedLicense.mockResolvedValue([]);

      const result = await controller.getApprovedLicense('admin-1');

      expect(result).toEqual([]);
    });
  });

  describe('approveLicense', () => {
    it('should call service.approveLicense with dto and userId', async () => {
      const dto = { licenseStatus: 'APPROVED' as any };
      const expected = {
        sucess: true,
        message: 'License has been approved.',
        data: { userId: 'vendor-1', licenseStatus: 'APPROVED' },
      };
      mockUserService.approveLicense.mockResolvedValue(expected);

      const result = await controller.approveLicense(dto, 'vendor-1');

      expect(mockUserService.approveLicense).toHaveBeenCalledWith(dto, 'vendor-1');
      expect(result).toEqual(expected);
    });

    it('should call service.approveLicense with REJECTED status', async () => {
      const dto = { licenseStatus: 'REJECTED' as any };
      const expected = {
        sucess: true,
        message: 'License has been rejected.',
        data: { userId: 'vendor-2', licenseStatus: 'REJECTED' },
      };
      mockUserService.approveLicense.mockResolvedValue(expected);

      const result = await controller.approveLicense(dto, 'vendor-2');

      expect(mockUserService.approveLicense).toHaveBeenCalledWith(dto, 'vendor-2');
      expect(result.data.licenseStatus).toBe('REJECTED');
    });
  });
});
