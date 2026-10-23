import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CalendarFeedController, VendorCalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorCalendarSyncController, CalendarFeedController],
  providers: [CalendarSyncService],
  exports: [CalendarSyncService],
})
export class CalendarSyncModule {}
