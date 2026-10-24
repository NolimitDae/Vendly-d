import { InternalServerErrorException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

const mockCancel = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({ subscriptions: { cancel: (...a: unknown[]) => mockCancel(...a) } })),
}));
jest.mock('src/config/app.config', () => ({ __esModule: true, default: () => ({ app: { client_app_url: 'https://app.test' } }) }));

const plan = { id: 'plan1', vendor_id: 'vp1', subscription_id: 'list1', stripe_subscription_id: 'sub_1' };
const prisma: any = {
  vendorProfile: { findUnique: jest.fn(), update: jest.fn() },
  vendorSubscriptionPlan: { findFirst: jest.fn(), update: jest.fn() },
  subscriptionlist: { update: jest.fn() },
  user: { findFirst: jest.fn() },
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionsService(prisma);
  });

  describe('cancel', () => {
    beforeEach(() => prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vp1', vendorSubscriptionPlans: [plan] }));

    it('marks the plan cancelled once Stripe has stopped billing', async () => {
      mockCancel.mockResolvedValue({ id: 'sub_1', status: 'canceled' });
      await service.cancel('u1');
      expect(mockCancel).toHaveBeenCalledWith('sub_1');
      expect(prisma.vendorProfile.update).toHaveBeenCalledWith({ where: { id: 'vp1' }, data: { subscription_active: false } });
    });

    it('changes nothing and says so when Stripe could not cancel (the vendor would still be billed)', async () => {
      mockCancel.mockRejectedValue(Object.assign(new Error('Stripe is down'), { code: 'api_error' }));
      await expect(service.cancel('u1')).rejects.toThrow(InternalServerErrorException);
      expect(prisma.vendorSubscriptionPlan.update).not.toHaveBeenCalled();
      expect(prisma.vendorProfile.update).not.toHaveBeenCalled();
    });

    it('goes ahead when the subscription is already gone on Stripe', async () => {
      mockCancel.mockRejectedValue(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }));
      await service.cancel('u1');
      expect(prisma.vendorProfile.update).toHaveBeenCalledWith({ where: { id: 'vp1' }, data: { subscription_active: false } });
    });
  });

  describe('webhooks', () => {
    it('finds the vendor by the subscription id, not the card billing id', async () => {
      prisma.vendorSubscriptionPlan.findFirst.mockResolvedValue(plan);
      await service.handleWebhookEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'past_due', customer: 'cus_checkout' } } } as any);
      expect(prisma.vendorSubscriptionPlan.findFirst).toHaveBeenCalledWith({ where: { stripe_subscription_id: 'sub_1' }, orderBy: { created_at: 'desc' } });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.vendorProfile.update).toHaveBeenCalledWith({ where: { id: 'vp1' }, data: { subscription_active: false } });
      expect(prisma.vendorSubscriptionPlan.update).toHaveBeenCalledWith({ where: { id: 'plan1' }, data: { payment_status: 'FAILED' } });
    });

    it('turns the plan off when the subscription is deleted', async () => {
      prisma.vendorSubscriptionPlan.findFirst.mockResolvedValue(plan);
      await service.handleWebhookEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_checkout' } } } as any);
      expect(prisma.vendorProfile.update).toHaveBeenCalledWith({ where: { id: 'vp1' }, data: { subscription_active: false } });
      expect(prisma.subscriptionlist.update).toHaveBeenCalledWith({ where: { id: 'list1' }, data: { status: 'CANCELLED' } });
    });

    it('ignores a subscription Vendly does not know', async () => {
      prisma.vendorSubscriptionPlan.findFirst.mockResolvedValue(null);
      await service.handleWebhookEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_x', status: 'active' } } } as any);
      expect(prisma.vendorProfile.update).not.toHaveBeenCalled();
    });
  });
});
