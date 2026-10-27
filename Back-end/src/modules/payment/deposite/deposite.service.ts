import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposite.dto';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';

/** Card top-ups of the Vendly balance are off: nothing on the website or app uses them. */
const CARD_TOP_UPS_OPEN = false;
export const TOP_UPS_CLOSED = 'Adding money to your Vendly balance isn’t available.';

@Injectable()
export class DepositeService {
 
 constructor(
     private readonly prisma: PrismaService
   ) {}


   // add deposite
    async create(
      createDepositDto: CreateDepositDto,
      userId: string
    ) {
      // the balance holds vendor earnings only: a card top-up could be paid out and then charged back
      if (!CARD_TOP_UPS_OPEN) throw new ForbiddenException(TOP_UPS_CLOSED);


      const { amount, currency = 'usd' } = createDepositDto;

      if(!userId) {
        throw new BadRequestException('Invalid user id for deposit');
      }

      if(amount <= 0) {
        throw new BadRequestException('Deposit amount must be greater than zero');
      }

      const user = await this.prisma.user.findUnique({where: { id: userId }});

      if(!user) throw new BadRequestException('User not found');

      try {

        let customerId = user.billing_id;

        if (!customerId) {
          const customer = await StripePayment.createCustomer({
            user_id: userId,
            name: user.name,
            email: user.email,
          });
          customerId = customer.id;
          await this.prisma.user.update({
            where: { id: userId },
            data: { billing_id: customerId },
          });
        }

        const paymentIntent = await StripePayment.createPaymentIntent({
          amount: amount,
          currency: currency,
          customer_id: customerId,
          metadata: {
            userId: userId,
            type: 'deposit'
          }
        });

        await this.prisma.paymentTransaction.create({
          data: {
            user_id: userId,
            type: 'deposit',
            provider: 'stripe',
            reference_number: paymentIntent.id,
            status: 'pending',
            amount: amount,
            currency: currency,
          }
        });

        return {
          success: true,
          message: 'Deposit intent created successfully',
          data: {
            payment_intent_id: paymentIntent.id,
            client_secret: (paymentIntent as any).client_secret,
            amount: amount,
            currency: currency,
          }
        };
      } catch (error: any) {
        throw new BadRequestException(`Failed to create deposit intent: ${error?.message ?? 'Unknown error'}`);
      }
    }

}
