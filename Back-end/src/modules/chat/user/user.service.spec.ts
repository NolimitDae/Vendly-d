import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from 'src/prisma/prisma.service';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
  },
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return a list of non-CLIENT active users', async () => {
      const users = [
        { id: 'user-1', email: 'admin@test.com', name: 'Admin', type: 'ADMIN' },
        { id: 'user-2', email: 'vendor@test.com', name: 'Vendor', type: 'VENDOR' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 1,
            type: { not: 'CLIENT' },
          },
        }),
      );
    });

    it('should return an empty data array when no active non-CLIENT users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should return success false and a message when prisma throws', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.findAll();

      expect(result.success).toBe(false);
      expect((result as any).message).toBe('DB connection lost');
    });
  });
});
