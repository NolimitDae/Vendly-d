import { Module } from '@nestjs/common';
import { PushModule } from 'src/modules/push/push.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ChatExtrasController } from './chat-extras.controller';
import { ChatExtrasService } from './chat-extras.service';

/** Event group chats, pinned messages and quotes. MessageGateway comes from the global MessageModule. */
@Module({
  imports: [PrismaModule, PushModule],
  controllers: [ChatExtrasController],
  providers: [ChatExtrasService],
  exports: [ChatExtrasService],
})
export class ChatExtrasModule {}
