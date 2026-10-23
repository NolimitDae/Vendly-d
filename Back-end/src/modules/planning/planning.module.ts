import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';

/** "Plan your event": rule-based service checklist with budget split and vendors available. */
@Module({
  imports: [PrismaModule],
  controllers: [PlanningController],
  providers: [PlanningService],
})
export class PlanningModule {}
