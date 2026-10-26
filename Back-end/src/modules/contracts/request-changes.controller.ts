import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from './booking-contracts.service';
import { ApproveProposalDto, DeclineProposalDto, ProposalDto, SendProposalDto } from './dto/request-changes.dto';
import { RequestChangesService } from './request-changes.service';
import { requestMeta } from './request-meta';

const SIGN_LIMIT = { short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } };

/** Suggested changes to a booking request (see request-changes.ts). */
@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings/:id/changes')
export class RequestChangesController {
  constructor(private readonly changes: RequestChangesService) {}

  @ApiOperation({ summary: 'Vendor or customer: the suggestion waiting (or approved) on a request, and what the vendor’s editor starts from' })
  @Get()
  state(@GetUser() user: AuthUser, @Param('id') id: string) {
    return this.changes.state(id, user);
  }

  @ApiOperation({ summary: 'Vendor: price suggested terms and get the updated contract to sign (nothing saved)' })
  @Post('preview')
  preview(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProposalDto) {
    return this.changes.preview(id, user, dto);
  }

  @ApiOperation({ summary: 'Vendor: sign and send suggested terms to the customer' })
  @Post()
  @Throttle(SIGN_LIMIT)
  send(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendProposalDto, @Req() req: Request) {
    return this.changes.send(id, user, dto, requestMeta(req));
  }

  @ApiOperation({ summary: 'Vendor: withdraw suggested changes the customer hasn’t answered' })
  @Post('withdraw')
  withdraw(@GetUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.changes.withdraw(id, user, requestMeta(req));
  }

  @ApiOperation({ summary: 'Customer: approve and sign the suggested changes (the vendor then accepts as usual)' })
  @Post('approve')
  @Throttle(SIGN_LIMIT)
  approve(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveProposalDto, @Req() req: Request) {
    return this.changes.approve(id, user, dto.signature, requestMeta(req));
  }

  @ApiOperation({ summary: 'Customer: decline the suggested changes (the original request stands)' })
  @Post('decline')
  decline(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeclineProposalDto, @Req() req: Request) {
    return this.changes.decline(id, user, dto.reason, requestMeta(req));
  }
}
