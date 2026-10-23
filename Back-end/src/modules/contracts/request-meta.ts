import type { Request } from 'express';
import { clientIp } from 'src/common/helper/client-ip';
import { RequestMeta } from './booking-contracts.service';

/** The signer's address (the visitor's, also when the website forwards the call) and browser. */
export function requestMeta(req: Request): RequestMeta {
  const ua = req.headers['user-agent'];
  return { ip: clientIp(req as any), userAgent: Array.isArray(ua) ? ua[0] : ua ?? null };
}
