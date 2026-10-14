import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlatformSettingsService } from './platform-settings.service';
import { PromoService } from './promo.service';
import { FlagsController } from './flags.controller';

/** Database-backed platform settings (fees), promo codes and feature flags. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FlagsController],
  providers: [PlatformSettingsService, PromoService],
  exports: [PlatformSettingsService, PromoService],
})
export class PlatformModule {}
