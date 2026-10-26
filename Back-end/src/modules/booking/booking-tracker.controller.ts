import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BookingTrackerService } from './booking-tracker.service';

/** The vendor's day-of steps, shown to the customer as a progress tracker (see booking-tracker.ts). */
@ApiTags('bookings')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingTrackerController {
  constructor(private readonly tracker: BookingTrackerService) {}

  @ApiOperation({ summary: 'Vendor: on my way to the customer (packages at the customer’s place)' })
  @Post(':id/en-route')
  @Throttle({ short: { limit: 2, ttl: 1000 } })
  enRoute(@GetUser() user: any, @Param('id') id: string) {
    return this.tracker.step(id, user.id, 'en_route');
  }

  @ApiOperation({ summary: 'Vendor: arrived at the customer’s place' })
  @Post(':id/arrived')
  @Throttle({ short: { limit: 2, ttl: 1000 } })
  arrived(@GetUser() user: any, @Param('id') id: string) {
    return this.tracker.step(id, user.id, 'arrived');
  }

  @ApiOperation({ summary: 'Vendor: the customer arrived (packages at the vendor’s place)' })
  @Post(':id/check-in')
  @Throttle({ short: { limit: 2, ttl: 1000 } })
  checkIn(@GetUser() user: any, @Param('id') id: string) {
    return this.tracker.step(id, user.id, 'check_in');
  }
}
