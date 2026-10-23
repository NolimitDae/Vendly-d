import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { InvoiceService } from './invoice.service';

const DOWNLOAD_LIMIT = { short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60_000 } };

function sendPdf(res: Response, f: { buffer: Buffer; name: string }, disposition: 'inline' | 'attachment') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${f.name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.buffer);
}

/** The final invoice PDF for a booking: the customer, the vendor (with their payout) or a Vendly admin. */
@ApiTags('bookings')
@Controller()
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get('bookings/:id/invoice')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(DOWNLOAD_LIMIT)
  async download(@GetUser() user: any, @Param('id') id: string, @Res() res: Response) {
    sendPdf(res, await this.invoices.pdfFor(id, { id: user.id, type: user.type }), 'attachment');
  }

  /** A five-minute link to the same PDF that needs no login header (the mobile app opens it in the browser). */
  @Get('bookings/:id/invoice/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle(DOWNLOAD_LIMIT)
  link(@GetUser() user: any, @Param('id') id: string) {
    return this.invoices.linkFor(id, { id: user.id, type: user.type });
  }

  @Get('invoices/:token')
  @Throttle(DOWNLOAD_LIMIT)
  async file(@Param('token') token: string, @Res() res: Response) {
    sendPdf(res, await this.invoices.resolveLink(token), 'inline');
  }
}
