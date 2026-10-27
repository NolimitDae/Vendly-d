import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserType } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { VendorDashboardService } from './dashboard.service';

@ApiTags('vendor/dashboard')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/dashboard')
export class VendorDashboardController {
  constructor(private readonly service: VendorDashboardService) {}

  /** What needs the vendor's attention, and the next few bookings (the website's dashboard home). */
  @Get()
  @ApiOperation({ summary: 'Vendor: requests to answer, payments and complaints to follow up, rentals to check in, unread chats, and upcoming bookings' })
  home(@GetUser() user: any) {
    if (user.type !== UserType.VENDOR) throw new ForbiddenException('Only vendors have a dashboard.');
    return this.service.home(user.id);
  }

  /** Earned by month (after commission and refunds), bookings by status, upcoming, rating, top 5 clients. */
  @Get('stats')
  @ApiQuery({ name: 'months', required: false, description: 'How many months back, 1 to 24 (default 12)' })
  @ApiQuery({ name: 'tz', required: false, description: "The vendor's time zone for month boundaries (default UTC)" })
  stats(@GetUser() user: any, @Query('months') months?: string, @Query('tz') tz?: string) {
    return this.service.stats(user.id, { months: months ? Number(months) : undefined, tz });
  }
}
