import { BadRequestException, Controller, Get, Logger, NotFoundException, Optional, Param, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import type { Response } from 'express';
import { reversePlace, suggestPlaces } from './geo';
import { loadTile, parseTile, TILE_CACHE_SECONDS } from './tiles';

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

@ApiTags('Places')
@Controller('geo')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);

  // tiles are cached here (missing in tests that don't load Redis: then they're fetched each time)
  constructor(@Optional() @InjectRedis() private readonly redis?: Redis) {}

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

  @ApiOperation({ summary: 'One map tile (PNG) for the booking map, cached; only tile images are passed through' })
  // a map is about a dozen tiles; most come from the cache
  @Throttle({ short: { limit: 40, ttl: 1000 }, medium: { limit: 200, ttl: 10_000 }, long: { limit: 600, ttl: 60_000 } })
  @Get('tile/:z/:x/:y')
  async tile(@Param('z') z: string, @Param('x') x: string, @Param('y') y: string, @Res() res: Response) {
    const t = parseTile(z, x, y);
    if (!t) throw new NotFoundException('No such map tile.');
    let tile: { body: Buffer; type: string };
    try {
      tile = await loadTile(t, this.redis ?? null);
    } catch (err) {
      this.logger.warn(`Map tile ${z}/${x}/${y} failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The map is unavailable right now.');
    }
    res.setHeader('Content-Type', tile.type);
    res.setHeader('Cache-Control', `public, max-age=${TILE_CACHE_SECONDS}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // shown as <img> on the website's own origin and in the app
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(tile.body);
  }
}
