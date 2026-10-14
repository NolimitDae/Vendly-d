import { Module } from '@nestjs/common';
import { MailModule } from 'src/mail/mail.module';
import { PushModule } from 'src/modules/push/push.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EventToolsController } from './event-tools.controller';
import { EventToolsService } from './event-tools.service';

/** Run of show, shared files, budget from bookings, client access and saved vendor teams. */
@Module({
  imports: [PrismaModule, MailModule, PushModule],
  controllers: [EventToolsController],
  providers: [EventToolsService],
  exports: [EventToolsService],
})
export class EventToolsModule {}
