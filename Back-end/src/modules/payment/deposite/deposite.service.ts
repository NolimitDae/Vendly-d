import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposite.dto';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';

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
        if(!customerId) throw new BadRequestException('User does not have a billing customer ID');

        const customer = await StripePayment.createCustomer({
          user_id: userId,
          name: user.name,
          email: user.email,
        }) 
        customerId = customer.id;

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
