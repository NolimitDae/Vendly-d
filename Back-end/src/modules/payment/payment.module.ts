import { Module } from '@nestjs/common';
import { StripeModule } from './stripe/stripe.module';
import { DepositeModule } from './deposite/deposite.module';
import { WithdrawModule } from './withdraw/withdraw.module';

@Module({
  imports: [StripeModule,DepositeModule, WithdrawModule],
})
export class PaymentModule {}


