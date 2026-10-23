import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AddOnKind } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/guard/role/roles.decorator';
import { Role } from 'src/common/guard/role/role.enum';
import { RolesGuard } from 'src/common/guard/role/roles.guard';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { AddOnsService } from './add-ons.service';
import { BookingExtrasService } from './booking-extras.service';
import {
  BulkAttachDto,
  CreateAddOnDto,
  DeclineExtraDto,
  EscalateExtraDto,
  GiveBackDto,
  RequestExtraDto,
  ReviewExtraDto,
  SetListingAddOnsDto,
  UpdateAddOnDto,
} from './dto/add-ons.dto';
import { RetryInstallmentDto } from 'src/modules/booking/dto/payments.dto';

const kindOf = (k?: string) => (k === AddOnKind.FEE || k === AddOnKind.ADD_ON ? k : undefined);

/** The vendor's library of add-ons and fees, and which packages offer them. */
@ApiTags('vendor/add-ons')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/add-ons')
export class VendorAddOnsController {
  constructor(private readonly addOns: AddOnsService) {}

  @Get()
  list(@GetUser() user: any, @Query('kind') kind?: string, @Query('listing_id') listingId?: string) {
    return this.addOns.list(user.id, kindOf(kind), listingId);
  }

  @Get('suggestions')
  suggestions(@Query('kind') kind?: string) {
    return this.addOns.suggestions(kindOf(kind));
  }

  @Post()
  create(@GetUser() user: any, @Body() dto: CreateAddOnDto) {
    return this.addOns.create(user.id, dto);
  }

  @Post('attach')
  attach(@GetUser() user: any, @Body() dto: BulkAttachDto) {
    return this.addOns.bulkAttach(user.id, dto);
  }

  @Get('listing/:listingId')
  forListing(@GetUser() user: any, @Param('listingId') listingId: string) {
    return this.addOns.forListingAsVendor(user.id, listingId);
  }

  @Put('listing/:listingId')
  setForListing(@GetUser() user: any, @Param('listingId') listingId: string, @Body() dto: SetListingAddOnsDto) {
    return this.addOns.setForListing(user.id, listingId, dto.add_on_ids);
  }

  @Patch(':id')
  update(@GetUser() user: any, @Param('id') id: string, @Body() dto: UpdateAddOnDto) {
    return this.addOns.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.addOns.remove(user.id, id);
  }
}

/** Add-ons and fees on a booking after it's made, and money the vendor gives back. */
@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BookingExtrasController {
  constructor(
    private readonly extras: BookingExtrasService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('bookings/:id/extras')
  list(@GetUser() user: any, @Param('id') id: string) {
    return this.extras.list(id, user.id);
  }

  /** Vendor: send an add-on or a fee to the customer to approve. */
  @Post('bookings/:id/extras')
  @Throttle({ short: { limit: 3, ttl: 10_000 } })
  request(@GetUser() user: any, @Param('id') id: string, @Body() dto: RequestExtraDto) {
    return this.extras.request(id, user.id, dto);
  }

  /** Vendor: money off for the customer, from the vendor's part. */
  @Post('bookings/:id/give-back')
  @Throttle({ short: { limit: 2, ttl: 10_000 } })
  giveBack(@GetUser() user: any, @Param('id') id: string, @Body() dto: GiveBackDto) {
    return this.payments.giveBack(id, user.id, dto);
  }

  @Post('booking-extras/:extraId/approve')
  @Throttle({ short: { limit: 3, ttl: 10_000 } })
  approve(@GetUser() user: any, @Param('extraId') extraId: string, @Body() dto: RetryInstallmentDto) {
    return this.extras.approve(extraId, user.id, dto.payment_method_id);
  }

  @Post('booking-extras/:extraId/decline')
  decline(@GetUser() user: any, @Param('extraId') extraId: string, @Body() dto: DeclineExtraDto) {
    return this.extras.decline(extraId, user.id, dto.reason);
  }

  @Post('booking-extras/:extraId/withdraw')
  withdraw(@GetUser() user: any, @Param('extraId') extraId: string) {
    return this.extras.withdraw(extraId, user.id);
  }

  /** Vendor: send a declined or unanswered fee to Vendly to decide. */
  @Post('booking-extras/:extraId/escalate')
  escalate(@GetUser() user: any, @Param('extraId') extraId: string, @Body() dto: EscalateExtraDto) {
    return this.extras.escalate(extraId, user.id, dto.note);
  }
}

@ApiTags('admin/booking-extras')
@ApiBearerAuth('admin-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/booking-extras')
export class AdminBookingExtrasController {
  constructor(private readonly extras: BookingExtrasService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.extras.adminList(status === 'done' ? 'done' : 'open');
  }

  @Post(':extraId/review')
  review(@GetUser() user: any, @Param('extraId') extraId: string, @Body() dto: ReviewExtraDto) {
    return this.extras.adminReview(extraId, user.id ?? user.userId, dto);
  }
}
