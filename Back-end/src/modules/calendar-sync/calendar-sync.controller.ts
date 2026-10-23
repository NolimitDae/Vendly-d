import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SetImportUrlDto } from './dto/calendar-sync.dto';
import { CalendarSyncService } from './calendar-sync.service';

/** The signed-in vendor's own calendar sync settings. */
@ApiTags('vendor/calendar-sync')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/calendar-sync')
export class VendorCalendarSyncController {
  constructor(private readonly service: CalendarSyncService) {}

  /** Feed URL plus import status (last synced, last error). */
  @Get()
  get(@GetUser() user: any) {
    return this.service.getSettings(user.userId);
  }

  /** New private feed URL; the old one stops working. */
  @Post('feed/regenerate')
  regenerate(@GetUser() user: any) {
    return this.service.regenerateFeed(user.userId);
  }

  /** Connect (or replace) the calendar to import busy time from; it is fetched straight away. */
  @Put('import')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  setImport(@GetUser() user: any, @Body() dto: SetImportUrlDto) {
    return this.service.setImportUrl(user.userId, dto.url);
  }

  @Post('import/sync')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  sync(@GetUser() user: any) {
    return this.service.syncNow(user.userId);
  }

  @Delete('import')
  remove(@GetUser() user: any) {
    return this.service.removeImport(user.userId);
  }
}

/** Public .ics feed. Calendar apps can't send a login, so the unguessable token in the URL is the secret. */
@ApiTags('calendar')
@Controller('calendar')
export class CalendarFeedController {
  constructor(private readonly service: CalendarSyncService) {}

  @Get('feed/:file')
  async feed(@Param('file') file: string, @Res() res: Response) {
    if (!file.endsWith('.ics')) throw new NotFoundException();
    const body = await this.service.feed(file.slice(0, -'.ics'.length));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="vendly.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(body);
  }
}
