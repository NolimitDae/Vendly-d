import { Module } from '@nestjs/common';
import { ContactModule } from './contact/contact.module';
import { FaqModule } from './faq/faq.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    NotificationModule,
    ContactModule,
    FaqModule,
  ],
})
export class ApplicationModule {}
