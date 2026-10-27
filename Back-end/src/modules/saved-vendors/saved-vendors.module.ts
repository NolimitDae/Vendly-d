import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SavedVendorsController } from './saved-vendors.controller';
import { SavedVendorsService } from './saved-vendors.service';

@Module({
  imports: [PrismaModule],
  controllers: [SavedVendorsController],
  providers: [SavedVendorsService],
})
export class SavedVendorsModule {}
