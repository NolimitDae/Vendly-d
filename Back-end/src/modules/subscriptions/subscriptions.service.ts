import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';
import {
  SubscriptionBillingCycle,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from 'prisma/generated/client';
import appConfig from '../../config/app.config';

const Stripe = new stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil',
});

const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    monthlyPrice: 0,
    yearlyPrice: 0,
    commission: 0,
    features: [
      '14-day free trial',
      'Basic vendor profile',
      'Up to 5 listings',
      'Email support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 15,
    yearlyPrice: 144,
    commission: 5,
    features: [
      'Up to 20 listings',
      'Basic analytics',
      'Email support',
      'Custom vendor page',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 30,
    yearlyPrice: 288,
    commission: 3,
    features: [
      'Up to 100 listings',
      'Advanced analytics',
      'Priority email support',
      'Custom vendor page',
      'Promotional tools',
    ],
  },
  {
    id: 'elite',
    name: 'Elite',
    monthlyPrice: 60,
    yearlyPrice: 576,
    commission: 2,
    features: [
      'Unlimited listings',
      'Full analytics suite',
      'Priority chat & email support',
      'Custom vendor page',
      'Promotional tools',
      'Featured placement',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    monthlyPrice: 100,
    yearlyPrice: 960,
    commission: 1,
    features: [
      'Unlimited listings',
      'Full analytics suite',
      'Dedicated account manager',
      'Custom vendor page',
      'All promotional tools',
      'Top featured placement',
      'White-glove onboarding',
    ],
  },
];

const PRICE_ID_MAP: Record<string, { monthly: string; yearly: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
  elite: {
    monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_ELITE_YEARLY,
  },
  premium: {
    monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
  },
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  getPlans() {
    return PLANS;
  }

  async getMySubscription(userId: string) {
    try {
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { user_id: userId },
        include: {
          vendorSubscriptionPlans: {
            include: { subscription: true },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor profile not found');
      }

      const activePlan = vendor.vendorSubscriptionPlans[0] ?? null;

      return {
        subscription_active: vendor.subscription_active,
        plan: activePlan,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('getMySubscription error', error);
      throw new InternalServerErrorException('Failed to fetch subscription');
    }
  }

  async checkout(userId: string, dto: SubscribeDto) {
    try {
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { user_id: userId },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor profile not found');
      }

      // ── Free trial ──────────────────────────────────────────────
      if (dto.planId === 'free_trial') {
        const existing = await this.prisma.vendorSubscriptionPlan.findFirst({
          where: { vendor_id: vendor.id },
        });

        if (existing) {
          throw new BadRequestException(
            'You have already used or have an existing subscription',
          );
        }

        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 14);

        const subList = await this.prisma.subscriptionlist.create({
          data: {
            name: 'Free Trial',
            billing_cycle: SubscriptionBillingCycle.MONTHLY,
            status: SubscriptionStatus.ACTIVE,
          },
        });

        await this.prisma.vendorSubscriptionPlan.create({
          data: {
            vendor_id: vendor.id,
            subscription_id: subList.id,
            start_date: now,
            end_date: endDate,
            payment_status: SubscriptionPaymentStatus.PAID,
          },
        });

        await this.prisma.vendorProfile.update({
          where: { id: vendor.id },
          data: { subscription_active: true },
        });

        return { url: null, free: true };
      }

      // ── Paid plans ───────────────────────────────────────────────
      const planPrices = PRICE_ID_MAP[dto.planId];
      if (!planPrices) {
        throw new BadRequestException(`Unknown plan: ${dto.planId}`);
      }

      const priceId = planPrices[dto.billing];
      if (!priceId) {
        throw new BadRequestException(
          `No Stripe price configured for ${dto.planId} ${dto.billing}`,
        );
      }

      const successUrl = `${appConfig().app.client_app_url}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${appConfig().app.client_app_url}/dashboard/subscription?canceled=true`;

      const session = await Stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          vendor_id: vendor.id,
          plan_id: dto.planId,
          billing: dto.billing,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return { url: session.url };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('checkout error', error);
      throw new InternalServerErrorException('Checkout failed');
    }
  }

  async cancel(userId: string) {
    try {
      const vendor = await this.prisma.vendorProfile.findUnique({
        where: { user_id: userId },
        include: {
          vendorSubscriptionPlans: {
            include: { subscription: true },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor profile not found');
      }

      const activePlan = vendor.vendorSubscriptionPlans[0];
      if (!activePlan) {
        throw new BadRequestException('No active subscription found');
      }

      // Cancel on Stripe if there's a stripe_subscription_id stored in metadata
      // We look up by metadata to find the matching Stripe subscription
      try {
        const sessions = await Stripe.checkout.sessions.list({
          limit: 10,
        });

        for (const session of sessions.data) {
          if (
            session.metadata?.vendor_id === vendor.id &&
            session.subscription
          ) {
            await Stripe.subscriptions.cancel(
              session.subscription as string,
            );
            break;
          }
        }
      } catch (stripeError) {
        this.logger.warn('Could not cancel Stripe subscription', stripeError);
      }

      await this.prisma.vendorSubscriptionPlan.update({
        where: { id: activePlan.id },
        data: {
          payment_status: SubscriptionPaymentStatus.FAILED,
        },
      });

      await this.prisma.subscriptionlist.update({
        where: { id: activePlan.subscription_id },
        data: { status: SubscriptionStatus.CANCELLED },
      });

      await this.prisma.vendorProfile.update({
        where: { id: vendor.id },
        data: { subscription_active: false },
      });

      return { success: true, message: 'Subscription cancelled successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('cancel error', error);
      throw new InternalServerErrorException('Failed to cancel subscription');
    }
  }

  async handleWebhookEvent(event: stripe.Event) {
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as stripe.Checkout.Session;
          if (session.mode !== 'subscription') break;

          const { vendor_id, plan_id, billing } = session.metadata || {};
          if (!vendor_id || !plan_id) break;

          const billingCycle =
            billing === 'yearly'
              ? SubscriptionBillingCycle.YEARLY
              : SubscriptionBillingCycle.MONTHLY;

          const now = new Date();
          const endDate = new Date(now);
          if (billing === 'yearly') {
            endDate.setFullYear(endDate.getFullYear() + 1);
          } else {
            endDate.setMonth(endDate.getMonth() + 1);
          }

          const subList = await this.prisma.subscriptionlist.create({
            data: {
              name: plan_id,
              billing_cycle: billingCycle,
              status: SubscriptionStatus.ACTIVE,
            },
          });

          await this.prisma.vendorSubscriptionPlan.create({
            data: {
              vendor_id,
              subscription_id: subList.id,
              start_date: now,
              end_date: endDate,
              payment_status: SubscriptionPaymentStatus.PAID,
            },
          });

          await this.prisma.vendorProfile.update({
            where: { id: vendor_id },
            data: { subscription_active: true },
          });

          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          if (!subscriptionId) break;

          // Find vendor plan linked to this subscription via Stripe sessions
          this.logger.log(
            `Invoice payment succeeded for subscription: ${subscriptionId}`,
          );
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as stripe.Subscription;
          this.logger.log(
            `Subscription updated: ${subscription.id}, status: ${subscription.status}`,
          );

          if (
            subscription.status === 'active' ||
            subscription.status === 'trialing'
          ) {
            // Subscription is healthy — ensure vendor is marked active
            // We'd need a mapping from stripe customer to vendor_id here
          } else if (
            subscription.status === 'past_due' ||
            subscription.status === 'unpaid'
          ) {
            this.logger.warn(
              `Subscription ${subscription.id} is ${subscription.status}`,
            );
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as stripe.Subscription;
          this.logger.log(`Subscription deleted: ${subscription.id}`);

          // Find the latest VendorSubscriptionPlan tied to this customer
          // via Stripe customer ID if stored, otherwise log for now
          this.logger.warn(
            `Vendor subscription deleted on Stripe: ${subscription.id}`,
          );
          break;
        }

        default:
          this.logger.debug(`Unhandled subscription event: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('handleWebhookEvent error', error);
    }
  }
}
