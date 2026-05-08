import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { VendorListingController } from './listing.controller';
import { VendorListingService } from './listing.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorListingController],
  providers: [VendorListingService],
  exports: [VendorListingService],
})
export class VendorListingModule {}
