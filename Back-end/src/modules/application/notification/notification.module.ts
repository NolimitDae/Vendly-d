import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationController } from './notification.controller';
import { LIVE_NOTIFIER } from './live-notifier';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService, { provide: LIVE_NOTIFIER, useExisting: NotificationGateway }],
  exports: [NotificationGateway, NotificationService, LIVE_NOTIFIER],
})
export class NotificationModule {}
