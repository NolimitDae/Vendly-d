import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { VendorDashboardController } from './dashboard.controller';
import { VendorDashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorDashboardController],
  providers: [VendorDashboardService],
})
export class VendorDashboardModule {}
