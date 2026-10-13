import { CookieHelper } from "@/helper/cookie.helper";

export const ACCESS_TOKEN_COOKIE = "token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/** Stores the tokens returned by login or /auth/refresh-token. */
export function saveSession(accessToken: string, refreshToken?: string) {
  CookieHelper.set({ key: ACCESS_TOKEN_COOKIE, value: accessToken });
  if (refreshToken) CookieHelper.set({ key: REFRESH_TOKEN_COOKIE, value: refreshToken });
}

/** Signs the browser out: removes both tokens. */
export function clearSession() {
  CookieHelper.destroy({ key: ACCESS_TOKEN_COOKIE });
  CookieHelper.destroy({ key: REFRESH_TOKEN_COOKIE });
}
