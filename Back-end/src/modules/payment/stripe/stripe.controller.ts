import { Controller, Post, Req, Headers, Logger } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Stripe } from 'stripe';
import { ApiExcludeController } from '@nestjs/swagger';
import { BookingStatus } from 'prisma/generated/client';

@ApiExcludeController()
@Controller('payment/stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private transactionRepository: TransactionRepository,
    private readonly prisma: PrismaService,
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
          const bookingId = session.metadata?.booking_id;
          if (bookingId && session.payment_status === 'paid') {
            await this.prisma.booking.updateMany({
              where: { id: bookingId, status: BookingStatus.PENDING },
              data: { status: BookingStatus.CONFIRMED },
            });
          }
          break;
        }

        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta = pi.metadata || {};

          if (meta.type === 'deposit' && meta.transaction_id) {
            await this.prisma.paymentTransaction.update({
              where: { id: meta.transaction_id },
              data: { status: 'succeeded', reference_number: pi.id },
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
