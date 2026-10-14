import { Module } from '@nestjs/common';
import { PaymentsModule } from 'src/modules/payments/payments.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SettingsController } from './settings.controller';

// Fee settings, promo codes and flags come from the global PlatformModule.
@Module({
  imports: [PaymentsModule, PrismaModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
