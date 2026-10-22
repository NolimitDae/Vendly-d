import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { AdminIdentityController, IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [PrismaModule, PushModule],
  controllers: [IdentityController, AdminIdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
