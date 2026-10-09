import { Controller, Post, Req, Headers, Logger } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Stripe } from 'stripe';
import { ApiExcludeController } from '@nestjs/swagger';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

@ApiExcludeController()
@Controller('payment/stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private transactionRepository: TransactionRepository,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    try {

      const payload = req.rawBody.toString();
      const event = await this.stripeService.handleWebhook(payload, signature);

      if (!event.data || !event.data.object) return { received: true };

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;

          // Handle subscription checkout
          if (session.mode === 'subscription') {
            await this.subscriptionsService.handleWebhookEvent(event);
            break;
          }

          // Handle booking payment
          // payment is recorded only; confirmation happens when the vendor accepts and signs
          const bookingId = session.metadata?.booking_id;
          if (bookingId && session.payment_status === 'paid') {
            const paid = await this.prisma.booking.updateMany({
              where: { id: bookingId, paid_at: null },
              data: { paid_at: new Date() },
            });
            const booking = paid.count
              ? await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { customer_id: true, currency: true } })
              : null;
            if (booking) {
              await this.prisma.paymentTransaction.create({
                data: {
                  user_id: booking.customer_id,
                  type: 'booking_payment',
                  provider: 'stripe',
                  reference_number: session.id,
                  status: 'succeeded',
                  amount: (session.amount_total ?? 0) / 100,
                  currency: booking.currency ?? session.currency ?? 'usd',
                },
              });
            }
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'invoice.payment_succeeded': {
          await this.subscriptionsService.handleWebhookEvent(event);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          this.logger.log(`Stripe subscription deleted: ${subscription.id}`);
          await this.subscriptionsService.handleWebhookEvent(event);
          break;
        }

        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta = pi.metadata || {};

          if (meta.type === 'deposit') {
            await this.prisma.paymentTransaction.updateMany({
              where: { reference_number: pi.id, type: 'deposit' },
              data: { status: 'succeeded' },
            });
          }

          if (meta.userId) {
            await this.prisma.user.update({
              where: { id: meta.userId },
              data: { balance: { increment: pi.amount_received / 100 } },
            });
          }
          break;
        }

        default:
          this.logger.debug(`Unhandled Stripe event: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Webhook error', error);
      return { received: false };
    }
  }
}
