import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}
