import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from 'prisma/generated/client';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { BookingService } from 'src/modules/booking/booking.service';

@ApiTags('admin/bookings')
@ApiBearerAuth('admin-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/bookings')
export class AdminBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  getAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: BookingStatus,
  ) {
    return this.bookingService.getAllBookings({ page, limit, status });
  }
}
