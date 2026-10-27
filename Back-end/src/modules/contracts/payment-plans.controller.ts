import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from './booking-contracts.service';
import { ApproveProposalDto, DeclineProposalDto } from './dto/request-changes.dto';
import { PaymentPlanProposalDto, SendPaymentPlanDto } from './dto/payment-plans.dto';
import { PaymentPlansService } from './payment-plans.service';
import { requestMeta } from './request-meta';

const SIGN_LIMIT = { short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } };

/** A custom payment plan on a confirmed booking (payments/custom-plan.ts, payment-plans.service.ts). */
@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings/:id/payment-plan')
export class PaymentPlansController {
  constructor(private readonly plans: PaymentPlansService) {}

  @ApiOperation({ summary: 'Vendor or customer: the booking’s payments, the plan waiting (or last answered), and the vendor’s editor rules' })
  @Get()
  state(@GetUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.state(id, user);
  }

  @ApiOperation({ summary: 'Vendor: check a payment plan and get the amendment to sign (nothing saved)' })
  @Post('preview')
  preview(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: PaymentPlanProposalDto) {
    return this.plans.preview(id, user, dto);
  }

  @ApiOperation({ summary: 'Vendor: sign and send a payment plan for the payments not made yet' })
  @Post()
  @Throttle(SIGN_LIMIT)
  propose(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendPaymentPlanDto, @Req() req: Request) {
    return this.plans.propose(id, user, dto, requestMeta(req));
  }

  @ApiOperation({ summary: 'Vendor: withdraw a payment plan the customer hasn’t answered' })
  @Post('withdraw')
  withdraw(@GetUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.plans.withdraw(id, user, requestMeta(req));
  }

  @ApiOperation({ summary: 'Customer: sign to agree to the payment plan (its payments replace the unpaid ones)' })
  @Post('approve')
  @Throttle(SIGN_LIMIT)
  approve(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveProposalDto, @Req() req: Request) {
    return this.plans.approve(id, user, dto.signature, requestMeta(req));
  }

  @ApiOperation({ summary: 'Customer: decline the payment plan (the current payments stay)' })
  @Post('decline')
  decline(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeclineProposalDto, @Req() req: Request) {
    return this.plans.decline(id, user, dto.reason, requestMeta(req));
  }
}
