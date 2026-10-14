import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';
import { BookingModule } from '../../booking/booking.module';
import { PaymentsModule } from '../../payments/payments.module';

@Module({
  imports: [SubscriptionsModule, BookingModule, PaymentsModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}
