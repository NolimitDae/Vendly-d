import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EventPlannerController } from './event-planner.controller';
import { EventPlannerService } from './event-planner.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventPlannerController],
  providers: [EventPlannerService],
  exports: [EventPlannerService],
})
export class EventPlannerModule {}
