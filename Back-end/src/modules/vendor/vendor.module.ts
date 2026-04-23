import { Module } from '@nestjs/common';
import { VendorListingModule } from './listing/listing.module';

@Module({
  imports: [VendorListingModule],
  exports: [VendorListingModule],
})
export class VendorModule {}
