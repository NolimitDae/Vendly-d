import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { ContractsModule } from 'src/modules/contracts/contracts.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [PrismaModule, MailModule, PushModule, ContractsModule, PaymentsModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
