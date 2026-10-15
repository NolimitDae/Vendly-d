import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GeocodeService } from './geocode.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [GeocodeService],
  exports: [GeocodeService],
})
export class GeoModule {}
