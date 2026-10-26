import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AddOnsModule } from 'src/modules/add-ons/add-ons.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { ContractsModule } from 'src/modules/contracts/contracts.module';
import { RentalsModule } from 'src/modules/rentals/rentals.module';
import { VendorListingModule } from 'src/modules/vendor/listing/listing.module';
import { TestDataController } from './test-data.controller';
import { TestDataService } from './test-data.service';

@Module({
  imports: [PrismaModule, AddOnsModule, AuthModule, BookingModule, ContractsModule, RentalsModule, VendorListingModule],
  controllers: [TestDataController],
  providers: [TestDataService],
})
export class TestDataModule {}
