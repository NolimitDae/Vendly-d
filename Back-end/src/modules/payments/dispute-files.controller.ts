import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { resolveDisputeFile } from './dispute-files';

/** Dispute photos behind short-lived signed links (the link is the permission); never cached. */
@ApiExcludeController()
@Controller('dispute-files')
export class DisputeFilesController {
  @Get(':token')
  @Throttle({ short: { limit: 20, ttl: 1000 } })
  async file(@Param('token') token: string, @Res() res: Response) {
    const f = await resolveDisputeFile(token);
    res.setHeader('Content-Type', f.type);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${f.name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // shown as <img> on the web app's own origin; the signed token is the access check
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(f.buffer);
  }
}
