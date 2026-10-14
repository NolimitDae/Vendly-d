import { Module } from '@nestjs/common';
import { MailModule } from 'src/mail/mail.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { PushModule } from 'src/modules/push/push.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RentalsController, VendorRentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [PrismaModule, MailModule, PushModule, PaymentsModule],
  controllers: [VendorRentalsController, RentalsController],
  providers: [RentalsService],
})
export class RentalsModule {}
