import { Module } from '@nestjs/common';
import { VendorListingModule } from './listing/listing.module';
import { VendorDashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [VendorListingModule, VendorDashboardModule],
  exports: [VendorListingModule],
})
export class VendorModule {}
