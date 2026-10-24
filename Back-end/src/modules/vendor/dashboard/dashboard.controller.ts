import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { VendorDashboardService } from './dashboard.service';

@ApiTags('vendor/dashboard')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/dashboard')
export class VendorDashboardController {
  constructor(private readonly service: VendorDashboardService) {}

  /** Earned by month (after commission and refunds), bookings by status, upcoming, rating, top 5 clients. */
  @Get('stats')
  @ApiQuery({ name: 'months', required: false, description: 'How many months back, 1 to 24 (default 12)' })
  @ApiQuery({ name: 'tz', required: false, description: "The vendor's time zone for month boundaries (default UTC)" })
  stats(@GetUser() user: any, @Query('months') months?: string, @Query('tz') tz?: string) {
    return this.service.stats(user.id, { months: months ? Number(months) : undefined, tz });
  }
}
