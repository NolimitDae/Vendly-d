import { Test, TestingModule } from '@nestjs/testing';
import { ListingController } from './listing.controller';
import { ListingService } from './listing.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockListingService = {
  findAll: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
};

describe('ListingController', () => {
  let controller: ListingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListingController],
      providers: [{ provide: ListingService, useValue: mockListingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ListingController>(ListingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated listings', async () => {
      const mockResult = { success: true, data: [], meta: { total: 0 } };
      mockListingService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(1, 10, undefined, 'test');

      expect(mockListingService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        status: undefined,
        search: 'test',
      });
      expect(result).toEqual(mockResult);
    });

    it('should call findAll without filters when params are omitted', async () => {
      mockListingService.findAll.mockResolvedValue({ success: true, data: [] });

      await controller.findAll();

      expect(mockListingService.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        status: undefined,
        search: undefined,
      });
    });
  });

  describe('updateStatus', () => {
    it('should update listing status', async () => {
      const mockResult = { success: true, data: { id: 'l-1', status: 'ACTIVE' } };
      mockListingService.updateStatus.mockResolvedValue(mockResult);

      const result = await controller.updateStatus('l-1', 'ACTIVE' as any);

      expect(mockListingService.updateStatus).toHaveBeenCalledWith('l-1', 'ACTIVE');
      expect(result).toEqual(mockResult);
    });

    it('should propagate service errors', async () => {
      mockListingService.updateStatus.mockRejectedValue(new Error('Not found'));

      await expect(controller.updateStatus('bad-id', 'ACTIVE' as any)).rejects.toThrow('Not found');
    });
  });

  describe('remove', () => {
    it('should delete a listing', async () => {
      const mockResult = { success: true };
      mockListingService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove('l-1');

      expect(mockListingService.remove).toHaveBeenCalledWith('l-1');
      expect(result).toEqual(mockResult);
    });

    it('should propagate service errors on remove', async () => {
      mockListingService.remove.mockRejectedValue(new Error('Not found'));

      await expect(controller.remove('bad-id')).rejects.toThrow('Not found');
    });
  });
});
