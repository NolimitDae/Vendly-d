import { Module } from '@nestjs/common';
import { PushModule } from 'src/modules/push/push.module';
import { PlatformModule } from 'src/modules/platform/platform.module';
import { AddOnsModule } from 'src/modules/add-ons/add-ons.module';
import { ChatExtrasModule } from 'src/modules/chat/extras/chat-extras.module';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { AdminContractsController } from './admin-contracts.controller';
import { BookingContractsService } from './booking-contracts.service';
import { ContractsController } from './contracts.controller';
import { VendorContractsController } from './vendor-contracts.controller';
import { VendorContractsService } from './vendor-contracts.service';
import { RequestChangesController } from './request-changes.controller';
import { RequestChangesService } from './request-changes.service';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

@Module({
  imports: [PushModule, PlatformModule, AddOnsModule, ChatExtrasModule, PaymentsModule],
  controllers: [ContractsController, VendorContractsController, AdminContractsController, RequestChangesController, PaymentPlansController],
  providers: [VendorContractsService, BookingContractsService, RequestChangesService, PaymentPlansService],
  exports: [VendorContractsService, BookingContractsService],
})
export class ContractsModule {}
