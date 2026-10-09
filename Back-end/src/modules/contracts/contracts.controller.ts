import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser, BookingContractsService } from './booking-contracts.service';
import { VendorContractsService } from './vendor-contracts.service';
import {
  AmendmentPreviewDto,
  AmendmentRequestDto,
  BookingContractFieldsDto,
  SignContractDto,
} from './dto/contracts.dto';
import { requestMeta } from './request-meta';

const SIGN_LIMIT = { short: { limit: 2, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } };
const DOWNLOAD_LIMIT = { short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } };

@ApiTags('contracts')
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contracts: BookingContractsService,
    private readonly vendorContracts: VendorContractsService,
  ) {}

  // ─── Public: signed file links and verification ─────────────────────────

  @Get('files/:token')
  @Throttle(DOWNLOAD_LIMIT)
  async file(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const f = await this.contracts.resolveFile(token, requestMeta(req));
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Disposition', `${f.type === 'application/pdf' ? 'inline' : 'attachment'}; filename="${f.name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(f.buffer);
  }

  @Get('verify/:code')
  @Throttle(DOWNLOAD_LIMIT)
  verifyCode(@Param('code') code: string) {
    return this.contracts.verifyCode(code);
  }

  @Post('verify')
  @Throttle(DOWNLOAD_LIMIT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  verifyFile(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.contracts.verifyFile(file?.buffer, requestMeta(req));
  }

  // ─── Authenticated ──────────────────────────────────────────────────────

  @Get('templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  templates() {
    return this.vendorContracts.listActiveTemplates();
  }

  @Post('booking-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  bookingPreview(@GetUser() user: AuthUser, @Body() dto: BookingContractFieldsDto) {
    return this.contracts.previewForBooking(user.userId, dto);
  }

  @Get('booking/:bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  forBooking(@GetUser() user: AuthUser, @Param('bookingId') bookingId: string) {
    return this.contracts.listForBooking(bookingId, user);
  }

  @Post('booking/:bookingId/amendments/preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  previewAmendment(@GetUser() user: AuthUser, @Param('bookingId') bookingId: string, @Body() dto: AmendmentPreviewDto) {
    return this.contracts.previewAmendment(bookingId, user, dto);
  }

  @Post('booking/:bookingId/amendments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(SIGN_LIMIT)
  requestAmendment(
    @GetUser() user: AuthUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: AmendmentRequestDto,
    @Req() req: Request,
  ) {
    return this.contracts.requestAmendment(bookingId, user, dto, requestMeta(req));
  }

  @Get('event/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  eventContracts(@GetUser() user: AuthUser, @Param('eventId') eventId: string) {
    return this.contracts.eventContracts(eventId, user);
  }

  @Get('event/:eventId/zip')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(DOWNLOAD_LIMIT)
  eventZip(@GetUser() user: AuthUser, @Param('eventId') eventId: string) {
    return this.contracts.eventZipLink(eventId, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getOne(@GetUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.contracts.getOne(id, user, requestMeta(req));
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(DOWNLOAD_LIMIT)
  download(@GetUser() user: AuthUser, @Param('id') id: string, @Query('kind') kind?: string) {
    const k = kind === 'source' || kind === 'draft' ? kind : 'executed';
    return this.contracts.downloadLink(id, user, k);
  }

  @Post(':id/sign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(SIGN_LIMIT)
  sign(@GetUser() user: AuthUser, @Param('id') id: string, @Body() dto: SignContractDto, @Req() req: Request) {
    return this.contracts.signAmendment(id, user, dto.signature, requestMeta(req));
  }

  @Post(':id/decline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  decline(@GetUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.contracts.declineAmendment(id, user, requestMeta(req));
  }
}
