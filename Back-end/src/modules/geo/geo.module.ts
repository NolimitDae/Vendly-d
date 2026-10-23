import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GeocodeService } from './geocode.service';
import { GeoController } from './geo.controller';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [GeoController],
  providers: [GeocodeService],
  exports: [GeocodeService],
})
export class GeoModule {}
