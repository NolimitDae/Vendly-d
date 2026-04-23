import { Module } from '@nestjs/common';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './message/message.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [ConversationModule, MessageModule, UserModule, NotificationModule],
})
export class ChatModule {}
