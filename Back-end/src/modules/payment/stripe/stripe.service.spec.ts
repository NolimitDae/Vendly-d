import { Test, TestingModule } from '@nestjs/testing';
import { StripeService } from './stripe.service';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';

jest.mock('../../../common/lib/Payment/stripe/StripePayment', () => ({
  StripePayment: {
    handleWebhook: jest.fn(),
  },
}));

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StripeService],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should delegate to StripePayment.handleWebhook and return the event', async () => {
      const mockEvent = {
        id: 'evt_test_001',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_001', amount_received: 10000 } },
      };
      (StripePayment.handleWebhook as jest.Mock).mockReturnValue(mockEvent);

      const rawBody = '{"id":"evt_test_001"}';
      const sig = 'stripe-sig-header';

      const result = await service.handleWebhook(rawBody, sig);

      expect(result).toEqual(mockEvent);
      expect(StripePayment.handleWebhook).toHaveBeenCalledWith(rawBody, sig);
      expect(StripePayment.handleWebhook).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors thrown by StripePayment.handleWebhook', async () => {
      (StripePayment.handleWebhook as jest.Mock).mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      await expect(
        service.handleWebhook('bad-payload', 'bad-sig'),
      ).rejects.toThrow('No signatures found matching the expected signature for payload');

      expect(StripePayment.handleWebhook).toHaveBeenCalledWith('bad-payload', 'bad-sig');
    });

    it('should pass array signatures through to StripePayment.handleWebhook', async () => {
      const mockEvent = {
        id: 'evt_002',
        type: 'checkout.session.completed',
        data: { object: {} },
      };
      (StripePayment.handleWebhook as jest.Mock).mockReturnValue(mockEvent);

      const sigs = ['sig-a', 'sig-b'];
      const result = await service.handleWebhook('raw', sigs);

      expect(result).toEqual(mockEvent);
      expect(StripePayment.handleWebhook).toHaveBeenCalledWith('raw', sigs);
    });
  });
});
