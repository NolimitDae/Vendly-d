import {
  BadRequestException,
  Controller,
  Headers,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import * as Sentry from '@sentry/nestjs';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Stripe } from 'stripe';
import { ApiExcludeController } from '@nestjs/swagger';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { BookingService } from '../../booking/booking.service';
import { PaymentsService } from '../../payments/payments.service';

@ApiExcludeController()
@Controller('payment/stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private transactionRepository: TransactionRepository,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly bookingService: BookingService,
    private readonly payments: PaymentsService,
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
          if (session.metadata?.booking_id && session.payment_status === 'paid') {
            await this.bookingService.recordPayment(session);
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

        // bank payments (large bookings): processing for days, then succeeded or payment_failed
        // (payment_failed also arrives for one returned after it had succeeded)
        case 'payment_intent.processing':
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
        case 'payment_intent.amount_capturable_updated': {
          await this.payments.reconcilePaymentIntent(event.data.object as Stripe.PaymentIntent);
          break;
        }

        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta = pi.metadata || {};
          if (meta.installment_id) await this.payments.reconcilePaymentIntent(pi);

          // credit a deposit only on its first successful delivery; Stripe may deliver events more than once
          if (meta.type === 'deposit' && meta.userId) {
            await this.prisma.$transaction(async (tx) => {
              // credit exactly the US-dollar deposit that was recorded for this user, never another currency
              const row = await tx.paymentTransaction.findFirst({
                where: { reference_number: pi.id, type: 'deposit', user_id: meta.userId },
                select: { id: true, amount: true, currency: true },
              });
              const cents = row ? Math.round(Number(row.amount) * 100) : NaN;
              if (!row || pi.currency !== 'usd' || (row.currency ?? 'usd').toLowerCase() !== 'usd' || pi.amount_received !== cents) {
                console.error(`Deposit ${pi.id} not credited: it doesn't match the recorded US-dollar deposit`);
                return;
              }
              const settled = await tx.paymentTransaction.updateMany({
                where: { id: row.id, status: { not: 'succeeded' } },
                data: { status: 'succeeded' },
              });
              if (settled.count === 1) {
                await tx.user.update({
                  where: { id: meta.userId },
                  data: { balance: { increment: cents / 100 } },
                });
              }
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
      // a non-2xx response makes Stripe retry; handlers above are safe to repeat
      if ((error as any)?.type === 'StripeSignatureVerificationError') {
        throw new BadRequestException('Invalid Stripe signature');
      }
      // a real processing failure (not a bad signature) means money may be out of sync: report it
      Sentry.captureException(error, { tags: { job: 'stripe-webhook' } });
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }
}
