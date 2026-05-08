import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth('customer-token')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Post()
  create(@GetUser() user: any, @Body() dto: CreateBookingDto) {
    return this.service.create(user.id, dto);
  }

  @Get('my/customer')
  getMyAsCustomer(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: BookingStatus,
  ) {
    return this.service.getMyBookingsAsCustomer(user.id, { page, limit, status });
  }

  @Get('my/vendor')
  @ApiBearerAuth('vendor-token')
  getMyAsVendor(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: BookingStatus,
  ) {
    return this.service.getMyBookingsAsVendor(user.id, { page, limit, status });
  }

  @Get(':id')
  getOne(@GetUser() user: any, @Param('id') id: string) {
    return this.service.getBooking(id, user.id);
  }

  @Patch(':id/confirm')
  @ApiBearerAuth('vendor-token')
  confirm(@GetUser() user: any, @Param('id') id: string) {
    return this.service.confirm(id, user.id);
  }

  @Patch(':id/reject')
  @ApiBearerAuth('vendor-token')
  reject(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
  ) {
    return this.service.reject(id, user.id, dto);
  }

  @Patch(':id/start')
  @ApiBearerAuth('vendor-token')
  startWork(@GetUser() user: any, @Param('id') id: string) {
    return this.service.startWork(id, user.id);
  }

  @Patch(':id/complete')
  @ApiBearerAuth('vendor-token')
  complete(@GetUser() user: any, @Param('id') id: string) {
    return this.service.complete(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(
    @GetUser() user: any,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.service.cancel(id, user.id, dto);
  }

  @Post(':id/checkout')
  createCheckout(@GetUser() user: any, @Param('id') id: string) {
    return this.service.createCheckoutSession(id, user.id);
  }
}
