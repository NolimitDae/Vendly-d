import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { AddOnsService } from './add-ons.service';
import { BookingExtrasService } from './booking-extras.service';
import { AdminBookingExtrasController, BookingExtrasController, VendorAddOnsController, VendorPackageOptionsController } from './add-ons.controller';
import { PackageOptionsService } from './package-options.service';

@Module({
  imports: [PrismaModule, MailModule, PushModule, PaymentsModule],
  controllers: [VendorAddOnsController, VendorPackageOptionsController, BookingExtrasController, AdminBookingExtrasController],
  providers: [AddOnsService, BookingExtrasService, PackageOptionsService],
  exports: [AddOnsService, BookingExtrasService, PackageOptionsService],
})
export class AddOnsModule {}
