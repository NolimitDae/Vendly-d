import { Test, TestingModule } from '@nestjs/testing';
import { PaymentTransactionController } from './payment-transaction.controller';
import { PaymentTransactionService } from './payment-transaction.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';

const mockPaymentTransactionService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  getRevenueByMonth: jest.fn(),
};

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

const mockRequest = (userId: string) =>
  ({ user: { userId } }) as any;

describe('PaymentTransactionController', () => {
  let controller: PaymentTransactionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentTransactionController],
      providers: [
        { provide: PaymentTransactionService, useValue: mockPaymentTransactionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentTransactionController>(PaymentTransactionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('revenueByMonth', () => {
    it('should call service.getRevenueByMonth with numeric year and return result', async () => {
      const expected = {
        success: true,
        data: [{ name: 'Jan', amount: 500 }, { name: 'Feb', amount: 0 }],
      };
      mockPaymentTransactionService.getRevenueByMonth.mockResolvedValue(expected);

      const result = await controller.revenueByMonth('2024');

      expect(mockPaymentTransactionService.getRevenueByMonth).toHaveBeenCalledWith(2024);
      expect(result).toEqual(expected);
    });

    it('should call service.getRevenueByMonth with undefined when no year provided', async () => {
      const expected = { success: true, data: [] };
      mockPaymentTransactionService.getRevenueByMonth.mockResolvedValue(expected);

      const result = await controller.revenueByMonth(undefined);

      expect(mockPaymentTransactionService.getRevenueByMonth).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with userId from request and return transactions', async () => {
      const expected = { success: true, data: [mockTransaction] };
      mockPaymentTransactionService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(mockPaymentTransactionService.findAll).toHaveBeenCalledWith('admin-1');
      expect(result).toEqual(expected);
    });

    it('should return empty data when no transactions exist', async () => {
      mockPaymentTransactionService.findAll.mockResolvedValue({ success: true, data: [] });

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(result).toEqual({ success: true, data: [] });
    });

    it('should return error object when service throws', async () => {
      mockPaymentTransactionService.findAll.mockRejectedValue(new Error('Service error'));

      const result = await controller.findAll(mockRequest('admin-1'));

      expect(result).toEqual({ success: false, message: 'Service error' });
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id and userId from request', async () => {
      const expected = { success: true, data: mockTransaction };
      mockPaymentTransactionService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(mockRequest('admin-1'), 'txn-1');

      expect(mockPaymentTransactionService.findOne).toHaveBeenCalledWith('txn-1', 'admin-1');
      expect(result).toEqual(expected);
    });

    it('should return failure when transaction is not found', async () => {
      const expected = { success: false, message: 'Payment transaction not found' };
      mockPaymentTransactionService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(mockRequest('admin-1'), 'bad-id');

      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockPaymentTransactionService.findOne.mockRejectedValue(new Error('Lookup error'));

      const result = await controller.findOne(mockRequest('admin-1'), 'txn-1');

      expect(result).toEqual({ success: false, message: 'Lookup error' });
    });
  });

  describe('remove', () => {
    it('should call service.remove with id and userId from request', async () => {
      const expected = { success: true, message: 'Payment transaction deleted successfully' };
      mockPaymentTransactionService.remove.mockResolvedValue(expected);

      const result = await controller.remove(mockRequest('admin-1'), 'txn-1');

      expect(mockPaymentTransactionService.remove).toHaveBeenCalledWith('txn-1', 'admin-1');
      expect(result).toEqual(expected);
    });

    it('should return failure when transaction is not found', async () => {
      const expected = { success: false, message: 'Payment transaction not found' };
      mockPaymentTransactionService.remove.mockResolvedValue(expected);

      const result = await controller.remove(mockRequest('admin-1'), 'bad-id');

      expect(result).toEqual(expected);
    });

    it('should return error object when service throws', async () => {
      mockPaymentTransactionService.remove.mockRejectedValue(new Error('Delete error'));

      const result = await controller.remove(mockRequest('admin-1'), 'txn-1');

      expect(result).toEqual({ success: false, message: 'Delete error' });
    });
  });
});
