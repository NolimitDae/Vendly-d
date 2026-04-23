import { Module } from '@nestjs/common';
import { DepositeService } from './deposite.service';
import { DepositeController } from './deposite.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DepositeController],
  providers: [DepositeService],
})
export class DepositeModule {}
