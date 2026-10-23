import { clientIp } from './client-ip';
import { requestMeta } from 'src/modules/contracts/request-meta';
import { ThrottlerBehindProxyGuard } from '../guard/throttler-behind-proxy.guard';

describe('visitor address', () => {
  const saved = process.env.VENDLY_PROXY_KEY;
  beforeEach(() => (process.env.VENDLY_PROXY_KEY = 'shared-secret'));
  afterAll(() => (process.env.VENDLY_PROXY_KEY = saved));

  it("uses the website's forwarded address only with the shared secret", () => {
    // website call: the edge in front of the API sees the website server
    const viaWebsite = { headers: { 'x-real-ip': '10.0.0.9', 'x-vendly-client-ip': '203.0.113.7', 'x-vendly-proxy-key': 'shared-secret' } };
    expect(clientIp(viaWebsite)).toBe('203.0.113.7');
    // someone sending the header themselves, without (or with a wrong) secret, is ignored
    expect(clientIp({ headers: { 'x-real-ip': '198.51.100.4', 'x-vendly-client-ip': '1.2.3.4' } })).toBe('198.51.100.4');
    expect(clientIp({ headers: { 'x-real-ip': '198.51.100.4', 'x-vendly-client-ip': '1.2.3.4', 'x-vendly-proxy-key': 'guess' } })).toBe('198.51.100.4');
  });

  it('ignores the forwarded address when no secret is configured', () => {
    delete process.env.VENDLY_PROXY_KEY;
    expect(clientIp({ headers: { 'x-real-ip': '198.51.100.4', 'x-vendly-client-ip': '1.2.3.4', 'x-vendly-proxy-key': '' } })).toBe('198.51.100.4');
  });

  it("falls back to the edge's X-Real-IP, then the last forwarded hop, then the socket", () => {
    expect(clientIp({ headers: { 'x-real-ip': '198.51.100.4' } })).toBe('198.51.100.4');
    expect(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, 198.51.100.5' } })).toBe('198.51.100.5');
    expect(clientIp({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('records the visitor on signatures and rate-limits per visitor', async () => {
    const req = { headers: { 'x-real-ip': '10.0.0.9', 'x-vendly-client-ip': '203.0.113.7', 'x-vendly-proxy-key': 'shared-secret', 'user-agent': 'Safari' } } as any;
    expect(requestMeta(req)).toEqual({ ip: '203.0.113.7', userAgent: 'Safari' });
    const guard = Object.create(ThrottlerBehindProxyGuard.prototype) as any;
    expect(await guard.getTracker(req)).toBe('203.0.113.7');
  });
});
