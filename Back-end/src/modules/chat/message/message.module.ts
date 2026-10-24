import { Global, Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { PushModule } from 'src/modules/push/push.module';

@Global()
@Module({
  imports: [PushModule],
  controllers: [MessageController],
  providers: [MessageService, MessageGateway],
  exports: [MessageGateway],
})
export class MessageModule {}
