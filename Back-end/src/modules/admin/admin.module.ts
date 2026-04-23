import { Module } from '@nestjs/common';
import { FaqModule } from './faq/faq.module';
import { ContactModule } from './contact/contact.module';
import { PaymentTransactionModule } from './payment-transaction/payment-transaction.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ServiceModule } from './service/service.module';

@Module({
  imports: [
    FaqModule,
    ContactModule,
    PaymentTransactionModule,
    UserModule,
    NotificationModule,
    ServiceModule,
  ],
})
export class AdminModule {}
