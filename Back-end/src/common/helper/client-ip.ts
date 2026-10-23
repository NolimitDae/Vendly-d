import { timingSafeEqual } from 'crypto';

type Req = { headers: Record<string, string | string[] | undefined>; ip?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** The website proxy's shared secret matches (VENDLY_PROXY_KEY on both services). */
function fromOurProxy(req: Req): boolean {
  const expected = process.env.VENDLY_PROXY_KEY;
  const given = one(req.headers['x-vendly-proxy-key']);
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The visitor's address behind Railway's edge. Website calls arrive through the website's own
 * server, which passes the visitor's address in X-Vendly-Client-IP with the shared secret; app
 * calls come straight through the edge, which sets X-Real-IP. Falls back to the last
 * X-Forwarded-For hop, then the socket address.
 */
export function clientIp(req: Req): string | null {
  if (fromOurProxy(req)) {
    const viaWebsite = one(req.headers['x-vendly-client-ip']);
    if (viaWebsite) return viaWebsite;
  }
  const realIp = one(req.headers['x-real-ip']);
  if (realIp) return realIp;
  const xff = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return hops[hops.length - 1] || req.ip || null;
}
