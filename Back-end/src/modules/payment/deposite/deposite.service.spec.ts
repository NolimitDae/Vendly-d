import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DepositeService } from './deposite.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';

jest.mock('src/common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    createCustomer: jest.fn(),
    createPaymentIntent: jest.fn(),
  },
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  paymentTransaction: {
    create: jest.fn(),
  },
};

const mockUser = {
  id: 'user-1',
  name: 'Jane Doe',
  email: 'jane@test.com',
  billing_id: 'cus_existing',
  balance: 0,
};

describe('DepositeService', () => {
  let service: DepositeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DepositeService>(DepositeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a deposit intent and return client secret', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (StripePayment.createCustomer as jest.Mock).mockResolvedValue({
        id: 'cus_new',
      });
      (StripePayment.createPaymentIntent as jest.Mock).mockResolvedValue({
        id: 'pi_abc123',
        client_secret: 'pi_abc123_secret',
      });
      mockPrisma.paymentTransaction.create.mockResolvedValue({});

      const result = await service.create({ amount: 100, currency: 'usd' }, 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.payment_intent_id).toBe('pi_abc123');
      expect(result.data.client_secret).toBe('pi_abc123_secret');
      expect(result.data.amount).toBe(100);
      expect(result.data.currency).toBe('usd');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(StripePayment.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          name: mockUser.name,
          email: mockUser.email,
        }),
      );
      expect(StripePayment.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          currency: 'usd',
          customer_id: 'cus_new',
          metadata: expect.objectContaining({ userId: 'user-1', type: 'deposit' }),
        }),
      );
      expect(mockPrisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'user-1',
            type: 'deposit',
            provider: 'stripe',
            reference_number: 'pi_abc123',
            status: 'pending',
            amount: 100,
          }),
        }),
      );
    });

    it('should default currency to usd when not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (StripePayment.createCustomer as jest.Mock).mockResolvedValue({ id: 'cus_new' });
      (StripePayment.createPaymentIntent as jest.Mock).mockResolvedValue({
        id: 'pi_def456',
        client_secret: 'pi_def456_secret',
      });
      mockPrisma.paymentTransaction.create.mockResolvedValue({});

      const result = await service.create({ amount: 50 }, 'user-1');

      expect(result.data.currency).toBe('usd');
      expect(StripePayment.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'usd' }),
      );
    });

    it('should throw BadRequestException when userId is missing', async () => {
      await expect(
        service.create({ amount: 100 }, ''),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when amount is zero', async () => {
      await expect(
        service.create({ amount: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when amount is negative', async () => {
      await expect(
        service.create({ amount: -50 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ amount: 100 }, 'nonexistent-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user has no billing_id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        billing_id: null,
      });

      await expect(
        service.create({ amount: 100 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should wrap Stripe errors in a BadRequestException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (StripePayment.createCustomer as jest.Mock).mockRejectedValue(
        new Error('Stripe API failure'),
      );

      await expect(
        service.create({ amount: 100 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
