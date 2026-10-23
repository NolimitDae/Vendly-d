import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import appConfig from '../../config/app.config';

/**
 * The website's login lives in HttpOnly cookies that browser JavaScript can't read. The website
 * calls the API through its own `/api` path (a Next.js rewrite), so these cookies belong to the
 * website's own domain. The mobile app keeps using `Authorization: Bearer` tokens and never gets
 * these cookies: they are only set when the request says it comes from the website.
 */
export const ACCESS_COOKIE = 'vendly_session';
export const REFRESH_COOKIE = 'vendly_refresh';
/** Not secret and readable by the page: only says "someone is logged in" so the UI can show the right links. */
export const LOGGED_IN_COOKIE = 'vendly_logged_in';
/** Cookies the website used to write from JavaScript (cleared when it moves to the HttpOnly ones). */
export const LEGACY_COOKIES = ['token', 'refresh_token'];

/** The website sends this on every API call. A cross-site form or page can't add it (it needs a CORS preflight). */
export const WEB_CLIENT_HEADER = 'x-requested-with';
export const WEB_CLIENT_VALUE = 'vendly-web';

/** The refresh cookie only goes to the auth endpoints (`/api/auth/refresh-token`, `/api/auth/logout`). */
const REFRESH_PATH = '/api/auth';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Req = Pick<Request, 'headers' | 'method'> & { secure?: boolean; __vendlyAuth?: AuthSource };

/** The value of one cookie from the Cookie header (no cookie-parser needed). */
export function readCookie(req: Pick<Request, 'headers'>, name: string): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The Bearer token, ignoring the empty ones the website used to send when logged out ("Bearer undefined"). */
export function bearerToken(req: Pick<Request, 'headers'>): string | null {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.*)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

export function isWebClient(req: Pick<Request, 'headers'>): boolean {
  return String(req.headers?.[WEB_CLIENT_HEADER] ?? '').toLowerCase() === WEB_CLIENT_VALUE;
}

const verifies = (token: string) => {
  try {
    jwt.verify(token, appConfig().jwt.secret);
    return true;
  } catch {
    return false;
  }
};

export type AuthSource = { token: string; from: 'bearer' | 'cookie' } | null;

/**
 * Which credential a request uses: a Bearer header (the app, and website sessions from before the
 * move to cookies) wins; the session cookie is used when there's no Bearer token, or when the
 * Bearer token no longer verifies (e.g. an expired one left over from the old website login).
 */
export function resolveAuthToken(req: Req): AuthSource {
  if (req.__vendlyAuth !== undefined) return req.__vendlyAuth;
  const bearer = bearerToken(req);
  const cookie = readCookie(req, ACCESS_COOKIE);
  let source: AuthSource = null;
  if (bearer && (!cookie || verifies(bearer))) source = { token: bearer, from: 'bearer' };
  else if (cookie) source = { token: cookie, from: 'cookie' };
  req.__vendlyAuth = source;
  return source;
}

/**
 * CSRF rule: a request that changes something and is logged in only by the cookie must carry the
 * website's header. SameSite=Lax already stops cross-site form posts; this also stops anything
 * else that could make the browser send the cookie without the website's own code.
 */
export function csrfBlocked(req: Req): boolean {
  const source = resolveAuthToken(req);
  return source?.from === 'cookie' && !SAFE_METHODS.has(String(req.method).toUpperCase()) && !isWebClient(req);
}

export const CSRF_MESSAGE = 'This request is missing the website header (X-Requested-With). Reload the page and try again.';

function cookieOptions(req: Req) {
  const proto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim();
  // Secure everywhere except plain-http local development
  const secure = process.env.NODE_ENV === 'production' || proto === 'https' || !!req.secure;
  return { secure, sameSite: 'lax' as const };
}

/** Lifetime of the cookies: as long as the refresh token lasts (an expired access cookie is refreshed). */
function maxAgeOf(refreshToken: string): number {
  const exp = (jwt.decode(refreshToken) as jwt.JwtPayload | null)?.exp;
  const ms = exp ? exp * 1000 - Date.now() : 0;
  return ms > 0 ? ms : 7 * 24 * 3600 * 1000;
}

export function setAuthCookies(req: Req, res: Pick<Response, 'cookie' | 'clearCookie'>, tokens: { access_token: string; refresh_token: string }) {
  const base = cookieOptions(req);
  const maxAge = maxAgeOf(tokens.refresh_token);
  res.cookie(ACCESS_COOKIE, tokens.access_token, { ...base, httpOnly: true, path: '/', maxAge });
  res.cookie(REFRESH_COOKIE, tokens.refresh_token, { ...base, httpOnly: true, path: REFRESH_PATH, maxAge });
  res.cookie(LOGGED_IN_COOKIE, '1', { ...base, httpOnly: false, path: '/', maxAge });
  // the old JS-readable token cookies are no longer needed
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { path: '/' });
}

export function clearAuthCookies(req: Req, res: Pick<Response, 'clearCookie'>) {
  const base = cookieOptions(req);
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(LOGGED_IN_COOKIE, { ...base, path: '/' });
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { path: '/' });
}

/**
 * For the website: puts freshly issued tokens into the cookies and leaves them out of the JSON, so
 * page scripts never see them. Other callers (the app) get the response unchanged.
 */
export function webSession<T>(req: Req, res: Pick<Response, 'cookie' | 'clearCookie'>, body: T): T {
  const auth = (body as any)?.authorization;
  if (!isWebClient(req) || !auth?.access_token || !auth?.refresh_token) return body;
  setAuthCookies(req, res, auth);
  return { ...(body as any), authorization: { type: 'cookie' } };
}

/** True when the request carries any of the website's login cookies. */
export function hasAuthCookies(req: Pick<Request, 'headers'>): boolean {
  return [ACCESS_COOKIE, REFRESH_COOKIE, LOGGED_IN_COOKIE].some((n) => readCookie(req, n) !== null);
}
