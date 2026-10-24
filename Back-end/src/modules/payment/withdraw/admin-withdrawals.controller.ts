import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { WithdrawService, type WithdrawalOutcome } from './withdraw.service';

class SettleWithdrawalDto {
  @IsIn(['completed', 'returned'])
  outcome: WithdrawalOutcome;

  // the Stripe transfer an admin found, kept as the reference (optional)
  @IsOptional()
  @IsString()
  @Matches(/^tr_[A-Za-z0-9]+$/, { message: 'A Stripe transfer id starts with tr_' })
  transfer_id?: string;
}

/** Withdrawals Stripe didn't confirm: the hourly check settles most; an admin settles the rest here. */
@ApiTags('admin-withdrawals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/withdrawals')
export class AdminWithdrawalsController {
  constructor(private readonly withdrawals: WithdrawService) {}

  @Get('needs-review')
  needsReview() {
    return this.withdrawals.listNeedsReview();
  }

  @Post(':id/settle')
  settle(@Param('id') id: string, @Body() dto: SettleWithdrawalDto) {
    return this.withdrawals.adminSettle(id, dto.outcome, dto.transfer_id);
  }
}
