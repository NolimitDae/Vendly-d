import { Module } from '@nestjs/common';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './message/message.module';
import { UserModule } from './user/user.module';
import { NotificationModule } from './notification/notification.module';
import { ChatExtrasModule } from './extras/chat-extras.module';
import { ChatSafetyModule } from './safety/safety.module';

@Module({
  imports: [ConversationModule, MessageModule, UserModule, NotificationModule, ChatExtrasModule, ChatSafetyModule],
})
export class ChatModule {}
