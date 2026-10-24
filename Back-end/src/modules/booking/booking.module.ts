import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { ContractsModule } from 'src/modules/contracts/contracts.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { ChatExtrasModule } from 'src/modules/chat/extras/chat-extras.module';
import { EventToolsModule } from 'src/modules/events/tools/event-tools.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRemindersService } from './booking-reminders.service';
import { RequestPhotosController } from './request-photos.controller';

@Module({
  imports: [PrismaModule, MailModule, PushModule, ContractsModule, PaymentsModule, ChatExtrasModule, EventToolsModule],
  controllers: [BookingController, RequestPhotosController],
  providers: [BookingService, BookingRemindersService],
  exports: [BookingService],
})
export class BookingModule {}
