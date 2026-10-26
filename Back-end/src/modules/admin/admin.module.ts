import { Module } from '@nestjs/common';
import { FaqModule } from './faq/faq.module';
import { ContactModule } from './contact/contact.module';
import { PaymentTransactionModule } from './payment-transaction/payment-transaction.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ServiceModule } from './service/service.module';
import { AdminBookingModule } from './booking/admin-booking.module';
import { SettingsModule } from './settings/settings.module';
import { TestDataModule } from './test-data/test-data.module';

@Module({
  imports: [
    FaqModule,
    ContactModule,
    PaymentTransactionModule,
    UserModule,
    NotificationModule,
    ServiceModule,
    AdminBookingModule,
    SettingsModule,
    TestDataModule,
  ],
})
export class AdminModule {}
