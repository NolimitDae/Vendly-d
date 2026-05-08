import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

const mockUserService = {
  findAll: jest.fn(),
};

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return the list of users from the service', async () => {
      const expected = {
        success: true,
        data: [
          { id: 'user-1', email: 'admin@test.com', name: 'Admin', type: 'ADMIN' },
        ],
      };
      mockUserService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(mockUserService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty data array when no users are found', async () => {
      mockUserService.findAll.mockResolvedValue({ success: true, data: [] });

      const result = await controller.findAll();

      expect(result.success).toBe(true);
      expect((result as any).data).toHaveLength(0);
    });

    it('should return error response when service throws', async () => {
      mockUserService.findAll.mockRejectedValue(new Error('Unexpected DB error'));

      const result = await controller.findAll();

      expect((result as any).success).toBe(false);
      expect((result as any).message).toBe('Unexpected DB error');
    });
  });
});
