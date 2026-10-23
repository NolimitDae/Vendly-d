import axios from "axios";
import { CookieHelper } from "@/helper/cookie.helper";
import { AppConfig } from "@/config/app.config";

/**
 * The website's login lives in HttpOnly cookies set by the API (through the website's own `/api`
 * path, see next.config.ts), so page scripts never see the tokens:
 *   vendly_session   access token   HttpOnly, Secure, SameSite=Lax, path /
 *   vendly_refresh   refresh token  HttpOnly, Secure, SameSite=Lax, path /api/auth
 *   vendly_logged_in "1"            readable: only tells the UI someone is logged in
 *
 * Before this the website kept both tokens in JS-readable cookies ("token", "refresh_token").
 * Those still work (the API accepts their Bearer header) and are moved onto the HttpOnly cookies
 * on the next page load (see migrateLegacySession in lib/Fetch.ts).
 */
export const LOGGED_IN_COOKIE = "vendly_logged_in";
export const ACCESS_TOKEN_COOKIE = "token"; // legacy, JS-readable
export const REFRESH_TOKEN_COOKIE = "refresh_token"; // legacy, JS-readable

/** The header the website sends on every API call; the API needs it on cookie-authenticated changes (CSRF). */
export const WEB_CLIENT_HEADER = "X-Requested-With";
export const WEB_CLIENT_VALUE = "vendly-web";

/** In the browser the API is reached through the website's own /api path; on the server, directly. */
export function apiBase(): string {
  return typeof window !== "undefined" ? "/api" : AppConfig().app.apiUrl;
}

/** Whether someone is logged in on this browser (for showing the right links; the API decides access). */
export function isLoggedIn(): boolean {
  return !!CookieHelper.get({ key: LOGGED_IN_COOKIE }) || !!CookieHelper.get({ key: ACCESS_TOKEN_COOKIE });
}

/** True while a session from before the move to HttpOnly cookies is still in the readable cookies. */
export function hasLegacySession(): boolean {
  return !!CookieHelper.get({ key: ACCESS_TOKEN_COOKIE }) || !!CookieHelper.get({ key: REFRESH_TOKEN_COOKIE });
}

export function clearLegacySession() {
  CookieHelper.destroy({ key: ACCESS_TOKEN_COOKIE });
  CookieHelper.destroy({ key: REFRESH_TOKEN_COOKIE });
}

/**
 * After login, role switch or refresh. The API sets the cookies itself, so normally there is
 * nothing to do. If it answered with tokens in the body instead (an API that predates the cookies,
 * e.g. during a deploy), keep them the old way so the login still works.
 */
export function saveSession(accessToken?: string, refreshToken?: string) {
  if (!accessToken) return;
  CookieHelper.set({ key: ACCESS_TOKEN_COOKIE, value: accessToken });
  if (refreshToken) CookieHelper.set({ key: REFRESH_TOKEN_COOKIE, value: refreshToken });
}

/**
 * Signs the browser out: drops the readable cookies here and asks the API to clear the HttpOnly
 * ones and revoke the refresh token. Never throws.
 */
export async function clearSession(): Promise<void> {
  const legacyRefresh = CookieHelper.get({ key: REFRESH_TOKEN_COOKIE });
  clearLegacySession();
  CookieHelper.destroy({ key: LOGGED_IN_COOKIE });
  if (typeof window === "undefined") return;
  try {
    await axios.post(`${apiBase()}/auth/logout`, legacyRefresh ? { refresh_token: legacyRefresh } : {}, {
      headers: { [WEB_CLIENT_HEADER]: WEB_CLIENT_VALUE },
      withCredentials: true,
      _skipAuthRefresh: true,
    } as any);
  } catch {
    // signed out locally either way
  }
}
