import { Module } from '@nestjs/common';
import { PushModule } from 'src/modules/push/push.module';
import { WithdrawService } from './withdraw.service';
import { WithdrawController } from './withdraw.controller';
import { AdminWithdrawalsController } from './admin-withdrawals.controller';

@Module({
  imports: [PushModule],
  controllers: [WithdrawController, AdminWithdrawalsController],
  providers: [WithdrawService],
})
export class WithdrawModule {}
