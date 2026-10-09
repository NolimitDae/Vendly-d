import { Module } from '@nestjs/common';
import { PushModule } from 'src/modules/push/push.module';
import { AdminContractsController } from './admin-contracts.controller';
import { BookingContractsService } from './booking-contracts.service';
import { ContractsController } from './contracts.controller';
import { VendorContractsController } from './vendor-contracts.controller';
import { VendorContractsService } from './vendor-contracts.service';

@Module({
  imports: [PushModule],
  controllers: [ContractsController, VendorContractsController, AdminContractsController],
  providers: [VendorContractsService, BookingContractsService],
  exports: [VendorContractsService, BookingContractsService],
})
export class ContractsModule {}
