import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { LicenceFilesController } from './licence-files.controller';
import { LicenceFilesService } from './licence-files.service';

@Module({
  imports: [PrismaModule],
  controllers: [LicenceFilesController],
  providers: [LicenceFilesService],
})
export class LicenceFilesModule {}
