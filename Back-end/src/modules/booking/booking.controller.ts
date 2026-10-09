import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BookingService } from './booking.service';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SignedBookingRequestDto, VendorConfirmDto } from 'src/modules/contracts/dto/contracts.dto';
import { requestMeta } from 'src/modules/contracts/request-meta';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth('customer-token')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Post()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  create(@GetUser() user: any, @Body() dto: SignedBookingRequestDto, @Req() req: Request) {
    return this.service.create(user.id, dto, requestMeta(req));
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
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  confirm(@GetUser() user: any, @Param('id') id: string, @Body() dto: VendorConfirmDto, @Req() req: Request) {
    return this.service.confirm(id, user.id, dto, requestMeta(req));
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

  /** Upload photo proof of service completion */
  @Post(':id/proof')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', 10))
  uploadProof(
    @GetUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() photos: Express.Multer.File[],
    @Body('notes') notes?: string,
  ) {
    return this.service.uploadProof(id, user.id, photos, notes);
  }

  /** Get proof submissions for a booking */
  @Get(':id/proof')
  getProofs(@GetUser() user: any, @Param('id') id: string) {
    return this.service.getProofs(id, user.id);
  }

  /** Vendor sends deliverables (files + links) to customer */
  @Post(':id/deliverables')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 10))
  sendDeliverable(
    @GetUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { title: string; message?: string; links?: string },
  ) {
    return this.service.sendDeliverable(id, user.id, files, body);
  }

  /** Get deliverables for a booking */
  @Get(':id/deliverables')
  getDeliverables(@GetUser() user: any, @Param('id') id: string) {
    return this.service.getDeliverables(id, user.id);
  }
}
