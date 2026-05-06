import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTransactionService } from './payment-transaction.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRepository } from 'src/common/repository/user/user.repository';

const mockTransaction = {
  id: 'txn-1',
  reference_number: 'REF-001',
  status: 'paid',
  provider: 'stripe',
  amount: 500,
  currency: 'USD',
  paid_amount: 500,
  paid_currency: 'USD',
  created_at: new Date('2024-03-15'),
  updated_at: new Date('2024-03-15'),
};

const mockAdminUser = {
  id: 'admin-1',
  type: 'ADMIN',
  email: 'admin@test.com',
};

const mockEditorUser = {
  id: 'editor-1',
  type: 'EDITOR',
  email: 'editor@test.com',
};

const mockPrisma = {
  paymentTransaction: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

const mockUserRepository = {
  getUserDetails: jest.fn(),
};

describe('PaymentTransactionService', () => {
  let service: PaymentTransactionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentTransactionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<PaymentTransactionService>(PaymentTransactionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all transactions for admin user', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.paymentTransaction.findMany.mockResolvedValue([mockTransaction]);

      const result = await service.findAll('admin-1');

      expect(mockUserRepository.getUserDetails).toHaveBeenCalledWith('admin-1');
      expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].reference_number).toBe('REF-001');
    });

    it('should filter by user_id for editor type users', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockEditorUser);
      mockPrisma.paymentTransaction.findMany.mockResolvedValue([]);

      const result = await service.findAll('editor-1');

      expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'editor-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return failure response when userRepository throws', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('User lookup failed'));

      const result = await service.findAll('bad-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('User lookup failed');
    });
  });

  describe('findOne', () => {
    it('should return a single transaction for admin user', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(mockTransaction);

      const result = await service.findOne('txn-1', 'admin-1');

      expect(mockPrisma.paymentTransaction.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'txn-1' }) }),
      );
      expect(result.success).toBe(true);
      expect((result as any).data.id).toBe('txn-1');
    });

    it('should return failure when transaction is not found', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(null);

      const result = await service.findOne('bad-id', 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Payment transaction not found');
    });

    it('should filter by user_id for editor type users', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockEditorUser);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(null);

      const result = await service.findOne('txn-1', 'editor-1');

      expect(mockPrisma.paymentTransaction.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'txn-1', user_id: 'editor-1' }),
        }),
      );
      expect(result.success).toBe(false);
    });

    it('should return failure response when prisma throws', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('DB error'));

      const result = await service.findOne('txn-1', 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });

  describe('getRevenueByMonth', () => {
    it('should return monthly revenue buckets for a given year', async () => {
      const transactions = [
        { created_at: new Date('2024-01-10'), amount: 200 },
        { created_at: new Date('2024-01-25'), amount: 300 },
        { created_at: new Date('2024-03-05'), amount: 150 },
      ];
      mockPrisma.paymentTransaction.findMany.mockResolvedValue(transactions);

      const result = await service.getRevenueByMonth(2024);

      expect(mockPrisma.paymentTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'paid',
            deleted_at: null,
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(12);
      expect(result.data[0]).toEqual({ name: 'Jan', amount: 500 });
      expect(result.data[2]).toEqual({ name: 'Mar', amount: 150 });
      expect(result.data[1]).toEqual({ name: 'Feb', amount: 0 });
    });

    it('should use current year when no year argument is provided', async () => {
      mockPrisma.paymentTransaction.findMany.mockResolvedValue([]);

      const result = await service.getRevenueByMonth();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(12);
    });
  });

  describe('remove', () => {
    it('should delete a transaction and return success', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(mockTransaction);
      mockPrisma.paymentTransaction.delete.mockResolvedValue(mockTransaction);

      const result = await service.remove('txn-1', 'admin-1');

      expect(mockPrisma.paymentTransaction.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'txn-1' } }),
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment transaction deleted successfully');
    });

    it('should return failure when transaction not found', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue(mockAdminUser);
      mockPrisma.paymentTransaction.findUnique.mockResolvedValue(null);

      const result = await service.remove('bad-id', 'admin-1');

      expect(mockPrisma.paymentTransaction.delete).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Payment transaction not found');
    });

    it('should return failure response when prisma throws', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('DB error'));

      const result = await service.remove('txn-1', 'admin-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });
});
