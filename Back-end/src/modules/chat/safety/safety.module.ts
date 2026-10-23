import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AdminChatReportsController, ChatSafetyController } from './safety.controller';
import { ChatSafetyService } from './safety.service';

/** Blocking and reporting in chat, and the admin report queue. */
@Module({
  imports: [PrismaModule],
  controllers: [ChatSafetyController, AdminChatReportsController],
  providers: [ChatSafetyService],
  exports: [ChatSafetyService],
})
export class ChatSafetyModule {}
