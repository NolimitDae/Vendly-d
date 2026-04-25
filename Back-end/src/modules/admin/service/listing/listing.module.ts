import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ListingService } from './listing.service';
import { ListingController } from './listing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ListingController],
  providers: [ListingService],
})
export class ListingModule {}
