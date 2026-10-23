import { BadRequestException, Controller, Get, Logger, Query, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { reversePlace, suggestPlaces } from './geo';

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

@ApiTags('Places')
@Controller('geo')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);

  @ApiOperation({ summary: 'Address suggestions while typing a location (optionally biased to lat/lng)' })
  @Throttle({ short: { limit: 10, ttl: 1000 } })
  @Get('suggest')
  async suggest(@Query('q') q = '', @Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = num(lat);
    const ln = num(lng);
    const near = la !== undefined && ln !== undefined && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null;
    try {
      return { success: true, data: await suggestPlaces(String(q), near) };
    } catch (err) {
      this.logger.warn(`Place suggestions failed: ${(err as Error).message}`);
      // typing still works; the location is geocoded when the package is saved
      return { success: true, data: [] };
    }
  }

  @ApiOperation({ summary: 'The place at a position, for "use my current location"' })
  @Throttle({ short: { limit: 5, ttl: 1000 } })
  @Get('reverse')
  async reverse(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const la = num(lat);
    const ln = num(lng);
    if (la === undefined || ln === undefined || Number.isNaN(la) || Number.isNaN(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
      throw new BadRequestException('A valid lat and lng are needed.');
    }
    try {
      return { success: true, data: await reversePlace(la, ln) };
    } catch (err) {
      this.logger.warn(`Reverse lookup failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Couldn’t look up that location. Type it instead.');
    }
  }
}
