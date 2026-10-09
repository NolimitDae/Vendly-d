import type { Request } from 'express';
import { RequestMeta } from './booking-contracts.service';

/** Client IP behind Railway's proxy: X-Real-IP, else the last X-Forwarded-For hop. */
export function requestMeta(req: Request): RequestMeta {
  const realIp = req.headers['x-real-ip'];
  const xff = req.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(xff) ? xff.join(',') : xff ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = (Array.isArray(realIp) ? realIp[0] : realIp) || forwarded[forwarded.length - 1] || req.ip || null;
  const ua = req.headers['user-agent'];
  return { ip, userAgent: Array.isArray(ua) ? ua[0] : ua ?? null };
}
