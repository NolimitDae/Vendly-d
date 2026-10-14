import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guard/role/roles.guard';
import { Roles } from '../../../common/guard/role/roles.decorator';
import { Role } from '../../../common/guard/role/role.enum';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { PlatformSettingsService } from 'src/modules/platform/platform-settings.service';
import { PromoService, type PromoInput } from 'src/modules/platform/promo.service';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { PrismaService } from 'src/prisma/prisma.service';

class CategoryFeeDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee_percent: number | null;
}

class FlagDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

class ResolveDisputeDto {
  @IsIn(['refund', 'partial_refund', 'release'])
  action: 'refund' | 'partial_refund' | 'release';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note: string;
}

class UserStatusDto {
  @IsIn([0, 1])
  status: 0 | 1;
}

/** Admin money tools: fees, promo codes, feature flags, disputes, revenue and account status. */
@ApiTags('admin-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class SettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly promos: PromoService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Fees and platform settings ────────────────────────────────────────

  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.update(body);
  }

  @Patch('settings/categories/:id/fee')
  setCategoryFee(@Param('id') id: string, @Body() dto: CategoryFeeDto) {
    return this.settings.setCategoryFee(id, dto.fee_percent ?? null);
  }

  // ─── Feature flags ─────────────────────────────────────────────────────

  @Get('flags')
  flags() {
    return this.settings.listFlags();
  }

  @Patch('flags/:key')
  setFlag(@Param('key') key: string, @Body() dto: FlagDto) {
    return this.settings.setFlag(key, dto.enabled, dto.description);
  }

  @Delete('flags/:key')
  deleteFlag(@Param('key') key: string) {
    return this.settings.deleteFlag(key);
  }

  // ─── Promo codes ───────────────────────────────────────────────────────

  @Get('promos')
  promoList() {
    return this.promos.list();
  }

  @Post('promos')
  promoCreate(@Body() body: PromoInput) {
    return this.promos.create(body);
  }

  @Patch('promos/:id')
  promoUpdate(@Param('id') id: string, @Body() body: Partial<PromoInput>) {
    return this.promos.update(id, body);
  }

  @Delete('promos/:id')
  promoRemove(@Param('id') id: string) {
    return this.promos.remove(id);
  }

  // ─── Disputes ──────────────────────────────────────────────────────────

  @Get('disputes')
  disputes(@Query('status') status?: 'open' | 'resolved') {
    return this.payments.listDisputes(status === 'resolved' ? 'resolved' : 'open');
  }

  @Post('disputes/:bookingId/resolve')
  resolve(@GetUser() user: any, @Param('bookingId') bookingId: string, @Body() dto: ResolveDisputeDto) {
    return this.payments.resolveDispute(bookingId, user.id ?? user.userId, dto);
  }

  // ─── Revenue ───────────────────────────────────────────────────────────

  @Get('reports/revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 3600 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw new BadRequestException('Use a valid date range');
    return this.payments.revenueReport(start, end);
  }

  // ─── Account status ────────────────────────────────────────────────────

  /** 0 suspends (every token stops working on its next request), 1 restores. */
  @Patch('users/:id/status')
  async userStatus(@GetUser() user: any, @Param('id') id: string, @Body() dto: UserStatusDto) {
    if (id === (user.id ?? user.userId)) throw new BadRequestException("You can't suspend your own account");
    const target = await this.prisma.user.findUnique({ where: { id }, select: { type: true } });
    if (!target) throw new BadRequestException('User not found');
    if (target.type === 'ADMIN' && dto.status === 0) throw new BadRequestException('Admins can’t be suspended here');
    const updated = await this.prisma.user.update({ where: { id }, data: { status: dto.status }, select: { id: true, name: true, email: true, status: true } });
    return { success: true, data: updated };
  }
}
