 import { Controller, Post, Req, Headers } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Request } from 'express';
import { TransactionRepository } from '../../../common/repository/transaction/transaction.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { Stripe } from 'stripe';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('payment/stripe')
export class StripeController {
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

      const pi = event.data.object as Stripe.PaymentIntent;
      const meta = pi.metadata || {};
     
      // Handle events
      switch (event.type) {
        case 'customer.created':
          break;
        case 'payment_intent.created':
          break;
        case 'payment_intent.succeeded': 
  
          if (meta.type === 'deposit' && meta.transaction_id) {
            await this.prisma.paymentTransaction.update({
              where: { id: meta.transaction_id },
              data: {
                status: 'succeeded',
                reference_number: pi.id,
              },
            });
          }

          await this.prisma.user.update({
            where: { id: meta.userId },
            data: {
              balance: {
                increment: pi.amount_received / 100, 
              },
            },
          });

          break; 
        case 'payment_intent.canceled':
          
          break;
        case 'payment_intent.requires_action':
         
          break;
        case 'payout.paid':
         
          break;
        case 'payout.failed':
          
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      console.error('Webhook error', error);
      return { received: false };
    }
  }
}
