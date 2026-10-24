import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminPlannersService } from './admin-planners.service';

@Module({
  controllers: [UserController],
  providers: [UserService, AdminPlannersService],
})
export class UserModule {}
