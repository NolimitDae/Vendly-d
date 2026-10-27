import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  bearerToken,
  clearAuthCookies,
  csrfBlocked,
  readCookie,
  resolveAuthToken,
  setAuthCookies,
  webSession,
} from './auth-cookies';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

jest.mock('../../config/app.config', () => ({ __esModule: true, default: () => ({ jwt: { secret: 'test-secret' } }) }));

const sign = (claims: object, expiresIn: number = 3600) => jwt.sign(claims, 'test-secret', { expiresIn });
const good = sign({ sub: 'u1' });
const expired = jwt.sign({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');
const req = (headers: Record<string, string>, method = 'GET') => ({ headers, method }) as any;
const WEB = { 'x-requested-with': 'vendly-web' };

describe('website login cookies', () => {
  it('reads one cookie from the Cookie header', () => {
    expect(readCookie(req({ cookie: 'a=1; vendly_session=abc.def; b=2' }), 'vendly_session')).toBe('abc.def');
    expect(readCookie(req({ cookie: 'xvendly_session=no' }), 'vendly_session')).toBeNull();
    expect(readCookie(req({}), 'vendly_session')).toBeNull();
  });

  it('ignores the empty Bearer headers the website used to send', () => {
    expect(bearerToken(req({ authorization: 'Bearer undefined' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer null' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer ' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer abc' }))).toBe('abc');
  });

  it('uses the Bearer token first (the app), the cookie when there is none', () => {
    expect(resolveAuthToken(req({ authorization: `Bearer ${good}` }))).toEqual({ token: good, from: 'bearer' });
    expect(resolveAuthToken(req({ cookie: `vendly_session=${good}` }))).toEqual({ token: good, from: 'cookie' });
    expect(resolveAuthToken(req({ authorization: 'Bearer undefined', cookie: `vendly_session=${good}` }))).toEqual({ token: good, from: 'cookie' });
    expect(resolveAuthToken(req({}))).toBeNull();
  });

  it('falls back to the cookie when a leftover Bearer token no longer verifies', () => {
    expect(resolveAuthToken(req({ authorization: `Bearer ${expired}`, cookie: `vendly_session=${good}` }))).toEqual({ token: good, from: 'cookie' });
    // with no cookie the Bearer token is still used, so the app gets its usual 401 and refreshes
    expect(resolveAuthToken(req({ authorization: `Bearer ${expired}` }))).toEqual({ token: expired, from: 'bearer' });
  });

  describe('CSRF rule', () => {
    const cookie = `vendly_session=${good}`;
    it('needs the website header on cookie-authenticated changes', () => {
      expect(csrfBlocked(req({ cookie }, 'POST'))).toBe(true);
      expect(csrfBlocked(req({ cookie }, 'DELETE'))).toBe(true);
      expect(csrfBlocked(req({ cookie, ...WEB }, 'POST'))).toBe(false);
    });
    it('lets reads through, and never applies to Bearer requests (the app)', () => {
      expect(csrfBlocked(req({ cookie }, 'GET'))).toBe(false);
      expect(csrfBlocked(req({ authorization: `Bearer ${good}`, cookie }, 'POST'))).toBe(false);
      expect(csrfBlocked(req({ authorization: `Bearer ${good}` }, 'PATCH'))).toBe(false);
    });
    it('is enforced by the JWT guard with a 403', () => {
      const guard = new JwtAuthGuard();
      const ctx = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req({ cookie }, 'POST') }) } as any;
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  it('sets HttpOnly, SameSite=Lax cookies (Secure in production) and drops the old readable ones', () => {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    setAuthCookies(req({}), res as any, { access_token: good, refresh_token: sign({ sub: 'u1', typ: 'refresh' }, 7 * 86400) });
    process.env.NODE_ENV = prev;
    const [access, refresh, flag] = res.cookie.mock.calls;
    expect(access[0]).toBe('vendly_session');
    expect(access[2]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(access[2].maxAge).toBeGreaterThan(6 * 86400 * 1000);
    expect(refresh[0]).toBe('vendly_refresh');
    expect(refresh[2]).toMatchObject({ httpOnly: true, secure: true, path: '/api/auth' });
    expect(flag).toEqual(['vendly_logged_in', '1', expect.objectContaining({ httpOnly: false })]);
    expect(res.clearCookie.mock.calls.map((c) => c[0])).toEqual(['token', 'refresh_token']);
  });

  it('clears every login cookie on logout', () => {
    const res = { clearCookie: jest.fn() };
    clearAuthCookies(req({}), res as any);
    expect(res.clearCookie).toHaveBeenCalledWith('vendly_session', expect.objectContaining({ path: '/' }));
    expect(res.clearCookie).toHaveBeenCalledWith('vendly_refresh', expect.objectContaining({ path: '/api/auth' }));
    expect(res.clearCookie).toHaveBeenCalledWith('vendly_logged_in', expect.objectContaining({ path: '/' }));
  });

  it('only gives cookies to the website; the app keeps its tokens', () => {
    const body = { success: true, authorization: { type: 'bearer', access_token: good, refresh_token: good }, type: 'CLIENT' };
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    expect(webSession(req({}), res as any, body)).toBe(body);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(webSession(req(WEB), res as any, body)).toEqual({ success: true, authorization: { type: 'cookie' }, type: 'CLIENT' });
    expect(res.cookie).toHaveBeenCalledTimes(3);
  });
});

describe('JwtStrategy token sources', () => {
  const strategy = new JwtStrategy({ user: { findUnique: jest.fn() } } as any, { exists: jest.fn().mockResolvedValue(1) } as any);
  it('reads the cookie when there is no Bearer token', () => {
    const extract = (strategy as any)._jwtFromRequest as (r: any) => string | null;
    expect(extract(req({ cookie: `vendly_session=${good}` }))).toBe(good);
    expect(extract(req({ authorization: `Bearer ${good}` }))).toBe(good);
    expect(extract(req({ authorization: 'Bearer undefined' }))).toBeNull();
  });
  it('refuses socket-only tokens as access tokens', async () => {
    await expect(strategy.validate({ sub: 'u1', typ: 'socket' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('sign-out and socket tokens', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JwtService } = require('@nestjs/jwt');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AuthService } = require('./auth.service');
  const jwtService = new JwtService({ secret: 'test-secret' });
  const service = new AuthService(jwtService, {}, {}, {}, {}, {}, {});

  it('finds who is signing out from the access token, else the refresh token', () => {
    expect(service.userFromTokens({ access: good })).toBe('u1');
    expect(service.userFromTokens({ access: expired, refresh: sign({ sub: 'u2', typ: 'refresh' }) })).toBe('u2');
    // a refresh token is not taken as an access token, nor the reverse
    expect(service.userFromTokens({ access: sign({ sub: 'u3', typ: 'refresh' }) })).toBeNull();
    expect(service.userFromTokens({ refresh: good })).toBeNull();
    expect(service.userFromTokens({})).toBeNull();
  });

  it('hands out a two-minute socket-only token', () => {
    const { data } = service.socketToken('u1', 's1');
    const claims: any = jwt.verify(data.token, 'test-secret');
    // carries its sign-in, so the socket closes when that sign-in ends
    expect(claims).toMatchObject({ sub: 'u1', typ: 'socket', sid: 's1' });
    expect(claims.exp - claims.iat).toBe(120);
    expect(data.user_id).toBe('u1');
  });
});
