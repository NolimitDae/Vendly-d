import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { AddOnsService } from './add-ons.service';
import { BookingExtrasService } from './booking-extras.service';
import { AdminBookingExtrasController, BookingExtrasController, VendorAddOnsController } from './add-ons.controller';

@Module({
  imports: [PrismaModule, MailModule, PushModule, PaymentsModule],
  controllers: [VendorAddOnsController, BookingExtrasController, AdminBookingExtrasController],
  providers: [AddOnsService, BookingExtrasService],
  exports: [AddOnsService, BookingExtrasService],
})
export class AddOnsModule {}
