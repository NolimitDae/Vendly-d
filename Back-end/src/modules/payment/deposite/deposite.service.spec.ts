import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DepositeService, TOP_UPS_CLOSED } from './deposite.service';
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
    update: jest.fn(),
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
    it('is turned off: card top-ups of the Vendly balance aren\'t available', async () => {
      await expect(service.create({ amount: 50, currency: 'usd' } as any, 'user-1')).rejects.toThrow(TOP_UPS_CLOSED);
      expect(StripePayment.createPaymentIntent).not.toHaveBeenCalled();
    });
  });
});
