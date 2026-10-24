import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { LicenceFilesService } from './licence-files.service';

/** Licence documents behind short-lived signed links (the link is the permission); never cached. */
@ApiExcludeController()
@Controller('licence-files')
export class LicenceFilesController {
  constructor(private readonly files: LicenceFilesService) {}

  @Get(':token')
  @Throttle({ short: { limit: 10, ttl: 1000 } })
  async file(@Param('token') token: string, @Res() res: Response) {
    const f = await this.files.resolve(token);
    res.setHeader('Content-Type', f.type);
    res.setHeader('Cache-Control', 'private, no-store');
    // photos and PDFs open in the browser tab; anything else only downloads
    res.setHeader('Content-Disposition', `${f.inline ? 'inline' : 'attachment'}; filename="${f.name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(f.buffer);
  }
}
