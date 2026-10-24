import {
  BadRequestException,
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
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BookingService, VENDOR_BOOKING_FILTERS, VendorBookingFilter } from './booking.service';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SignedBookingRequestDto, VendorConfirmDto } from 'src/modules/contracts/dto/contracts.dto';
import { requestMeta } from 'src/modules/contracts/request-meta';
import { CancelBookingDto, RejectBookingDto } from './dto/update-booking.dto';
import { DisputeBookingDto, DisputeReplyDto, RetryInstallmentDto } from './dto/payments.dto';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { DISPUTE_MAX_PHOTOS, DISPUTE_PHOTO_MAX_BYTES } from 'src/modules/payments/dispute-files';
import { REQUEST_MAX_PHOTOS, REQUEST_PHOTO_MAX_BYTES } from './request-photos';
import { CUSTOMER_BOOKING_TABS, CustomerBookingTab } from './customer-tabs';

// as the global pipe in main.ts
const bodyPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } });

@ApiTags('bookings')
@ApiBearerAuth('customer-token')
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(
    private readonly service: BookingService,
    private readonly payments: PaymentsService,
  ) {}

  @Post()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  create(@GetUser() user: any, @Body() dto: SignedBookingRequestDto, @Req() req: Request) {
    return this.service.create(user.id, dto, requestMeta(req));
  }

  /**
   * The same request with up to 10 inspiration photos: multipart, with the request as JSON in `request`
   * (it has nested fields a form can't carry) and the files in `photos`.
   */
  @Post('with-photos')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', REQUEST_MAX_PHOTOS, { storage: memoryStorage(), limits: { fileSize: REQUEST_PHOTO_MAX_BYTES, files: REQUEST_MAX_PHOTOS, fieldSize: 2 * 1024 * 1024 } }))
  async createWithPhotos(@GetUser() user: any, @Body('request') raw: string, @Req() req: Request, @UploadedFiles() photos?: Express.Multer.File[]) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new BadRequestException('The booking request is missing.');
    }
    // checked by the same rules as the JSON endpoint
    const dto: SignedBookingRequestDto = await bodyPipe.transform(body, { type: 'body', metatype: SignedBookingRequestDto });
    return this.service.create(user.id, dto, requestMeta(req), photos ?? []);
  }

  @Get('my/customer')
  getMyAsCustomer(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: BookingStatus,
    @Query('tab') tab?: string,
  ) {
    // pending | upcoming | active | complete (see customer-tabs.ts); unknown ones are ignored
    const t = (CUSTOMER_BOOKING_TABS as readonly string[]).includes(tab ?? '') ? (tab as CustomerBookingTab) : undefined;
    return this.service.getMyBookingsAsCustomer(user.id, { page, limit, status, tab: t });
  }

  @Get('my/vendor')
  @ApiBearerAuth('vendor-token')
  getMyAsVendor(
    @GetUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: BookingStatus,
    @Query('filter') filter?: string,
  ) {
    // refunds: money went back to the customer; complaints: the customer reported a problem (open first)
    const f = (VENDOR_BOOKING_FILTERS as readonly string[]).includes(filter ?? '') ? (filter as VendorBookingFilter) : undefined;
    return this.service.getMyBookingsAsVendor(user.id, { page, limit, status, filter: f });
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

  /** What cancelling now would do with the money (refund, fee kept, what the vendor keeps), in a plain sentence. */
  // reason_code: the vendor's "customer_didnt_pay" previews a non-payment cancellation (settled like the customer's)
  @Get(':id/cancel-preview')
  cancelPreview(@GetUser() user: any, @Param('id') id: string, @Query('reason_code') reasonCode?: string) {
    return this.service.cancelPreview(id, user.id, reasonCode);
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

  // ─── Phase B payments ──────────────────────────────────────────────────────

  /** Payment plan, installments, what is paid and when the vendor is paid. */
  @Get(':id/payments')
  paymentTimeline(@GetUser() user: any, @Param('id') id: string) {
    return this.payments.timeline(id, user.id);
  }

  /** Customer confirms the work was done; the vendor is paid right away. */
  @Post(':id/approve')
  approve(@GetUser() user: any, @Param('id') id: string) {
    return this.payments.approveBooking(id, user.id);
  }

  /** Customer raises a problem; the money stays held until it is resolved. */
  @Post(':id/dispute')
  @Throttle({ short: { limit: 2, ttl: 10_000 } })
  // multipart with up to 10 photos; plain JSON (reason only) still works for older apps
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FilesInterceptor('photos', DISPUTE_MAX_PHOTOS, { storage: memoryStorage(), limits: { fileSize: DISPUTE_PHOTO_MAX_BYTES, files: DISPUTE_MAX_PHOTOS } }))
  dispute(@GetUser() user: any, @Param('id') id: string, @Body() dto: DisputeBookingDto, @UploadedFiles() photos?: Express.Multer.File[]) {
    return this.payments.openDispute(id, user.id, dto, photos ?? []);
  }

  /** Vendor gives their side of an open dispute; Vendly sees it with the customer's report. */
  @Post(':id/dispute/reply')
  @Throttle({ short: { limit: 3, ttl: 10_000 } })
  disputeReply(@GetUser() user: any, @Param('id') id: string, @Body() dto: DisputeReplyDto) {
    return this.payments.replyToDispute(id, user.id, dto.reply);
  }

  /** Vendor takes a paid deposit before the event; it comes off the final payout. */
  @Post(':id/release-deposit')
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  releaseDeposit(@GetUser() user: any, @Param('id') id: string) {
    return this.payments.releaseDepositEarly(id, user.id);
  }

  /** Customer retries a failed charge, optionally with another saved card. */
  @Post(':id/installments/:installmentId/retry')
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  retryInstallment(@GetUser() user: any, @Param('id') id: string, @Param('installmentId') installmentId: string, @Body() dto: RetryInstallmentDto) {
    return this.payments.retryInstallment(id, installmentId, user.id, dto.payment_method_id);
  }
}
