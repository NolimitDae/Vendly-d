// external imports
import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';
import { clientIp } from 'src/common/helper/client-ip';

/** Rate limits per visitor, not per Railway edge server (which every request comes through). */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req as any) ?? 'unknown';
  }
}
