import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CategoryModule } from './category/category.module';
import { SubcategoryModule } from './subcategory/subcategory.module';
import { ListingModule } from './listing/listing.module';

@Module({
  imports: [
    PrismaModule,
    CategoryModule,
    SubcategoryModule,
    ListingModule
  ]
})
export class ServiceModule {}
