import { Test, TestingModule } from '@nestjs/testing';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

const mockStripeService = {
  handleWebhook: jest.fn(),
};

const mockTransactionRepository = {};

const mockPrisma = {
  booking: {
    updateMany: jest.fn(),
  },
  paymentTransaction: {
    update: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
};

const mockSubscriptionsService = {
  handleWebhookEvent: jest.fn(),
};

function makeRawBodyRequest(rawBody: string, signature: string) {
  return {
    rawBody: Buffer.from(rawBody),
    headers: { 'stripe-signature': signature },
  } as any;
}

describe('StripeController', () => {
  let controller: StripeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: TransactionRepository, useValue: mockTransactionRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
      ],
    }).compile();

    controller = module.get<StripeController>(StripeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook (POST /payment/stripe/webhook)', () => {
    it('should return { received: true } when event has no data object', async () => {
      const event = { type: 'unknown.event', data: {} };
      mockStripeService.handleWebhook.mockResolvedValue(event);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockStripeService.handleWebhook).toHaveBeenCalledWith('{}', 'sig');
    });

    it('should confirm a paid booking on checkout.session.completed (payment mode)', async () => {
      const bookingId = 'booking-99';
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'payment',
            payment_status: 'paid',
            metadata: { booking_id: bookingId },
          },
        },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: bookingId }),
        }),
      );
      expect(mockSubscriptionsService.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('should delegate subscription checkout to subscriptionsService', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            payment_status: 'paid',
            metadata: {},
          },
        },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockSubscriptionsService.handleWebhookEvent.mockResolvedValue(undefined);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsService.handleWebhookEvent).toHaveBeenCalledWith(event);
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.updated by delegating to subscriptionsService', async () => {
      const event = {
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_001', status: 'active' } },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockSubscriptionsService.handleWebhookEvent.mockResolvedValue(undefined);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsService.handleWebhookEvent).toHaveBeenCalledWith(event);
    });

    it('should handle invoice.payment_succeeded by delegating to subscriptionsService', async () => {
      const event = {
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_001' } },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockSubscriptionsService.handleWebhookEvent.mockResolvedValue(undefined);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsService.handleWebhookEvent).toHaveBeenCalledWith(event);
    });

    it('should handle customer.subscription.deleted by delegating to subscriptionsService', async () => {
      const event = {
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_del_001' } },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockSubscriptionsService.handleWebhookEvent.mockResolvedValue(undefined);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsService.handleWebhookEvent).toHaveBeenCalledWith(event);
    });

    it('should update paymentTransaction and user balance on payment_intent.succeeded (deposit)', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_001',
            amount_received: 10000,
            metadata: { type: 'deposit', transaction_id: 'txn-1', userId: 'user-1' },
          },
        },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);
      mockPrisma.paymentTransaction.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockPrisma.paymentTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'txn-1' },
          data: expect.objectContaining({ status: 'succeeded', reference_number: 'pi_001' }),
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            balance: { increment: 100 }, // 10000 cents / 100
          }),
        }),
      );
    });

    it('should return { received: false } when handleWebhook throws', async () => {
      mockStripeService.handleWebhook.mockRejectedValue(
        new Error('Invalid signature'),
      );

      const req = makeRawBodyRequest('bad-payload', 'bad-sig');
      const result = await controller.handleWebhook('bad-sig', req);

      expect(result).toEqual({ received: false });
    });

    it('should return { received: true } for unhandled event types without side-effects', async () => {
      const event = {
        type: 'charge.refunded',
        data: { object: { id: 'ch_001' } },
      };
      mockStripeService.handleWebhook.mockResolvedValue(event);

      const req = makeRawBodyRequest('{}', 'sig');
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
      expect(mockSubscriptionsService.handleWebhookEvent).not.toHaveBeenCalled();
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    });
  });
});
