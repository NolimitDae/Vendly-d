import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { CookieHelper } from "../helper/cookie.helper";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  WEB_CLIENT_HEADER,
  WEB_CLIENT_VALUE,
  apiBase,
  clearLegacySession,
  clearSession,
  saveSession,
} from "./session";

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipAuthRefresh?: boolean };

/**
 * Asks the API for a fresh session. The website's refresh token is in an HttpOnly cookie the API
 * reads itself; a session from before the cookies sends its readable refresh token once, and the
 * API answers by setting the HttpOnly cookies (and clearing the readable ones).
 * True when the session was renewed.
 */
async function refreshSession(): Promise<boolean> {
  const legacyRefresh = CookieHelper.get({ key: REFRESH_TOKEN_COOKIE });
  try {
    const res = await axios.post(
      `${apiBase()}/auth/refresh-token`,
      legacyRefresh ? { refresh_token: legacyRefresh } : {},
      { _skipAuthRefresh: true } as RetriableConfig,
    );
    if (res.data?.success) {
      const auth = res.data?.authorization;
      if (auth?.access_token) {
        // an API without the cookies: keep the old way
        saveSession(auth.access_token, auth.refresh_token);
      } else {
        clearLegacySession();
      }
      return true;
    }
    // the readable refresh token is no good: stop offering it
    if (legacyRefresh) CookieHelper.destroy({ key: REFRESH_TOKEN_COOKIE });
  } catch {
    // network trouble: fall through
  }
  return false;
}

// One refresh at a time: concurrent 401s wait for the same refresh instead of each starting their own.
let refreshing: Promise<boolean> | null = null;
const refreshOnce = () =>
  (refreshing ??= refreshSession().finally(() => {
    refreshing = null;
  }));

// Sessions from before the HttpOnly cookies move over on the first API call of a page load.
let migration: Promise<boolean> | null = null;
export function migrateLegacySession(): Promise<boolean> {
  if (!migration) {
    migration = CookieHelper.get({ key: REFRESH_TOKEN_COOKIE }) ? refreshOnce() : Promise.resolve(false);
  }
  return migration;
}
/** Test hook. */
export function __resetSessionState() {
  refreshing = null;
  migration = null;
}

/** "Bearer undefined" and friends: what the service files build when the token is no longer in JS. */
const EMPTY_BEARER = /^Bearer\s*(undefined|null)?\s*$/i;

/** The current readable token as a header, if a pre-cookie session still has one. */
const legacyAuthorization = () => {
  const token = CookieHelper.get({ key: ACCESS_TOKEN_COOKIE });
  return token ? `Bearer ${token}` : null;
};

/** Calls to our API through the website's /api path (the only ones that get cookies and the header). */
const isApiCall = (url?: string) => !!url && (url === apiBase() || url.startsWith(`${apiBase()}/`));

axios.interceptors.request.use(async (config: RetriableConfig) => {
  if (typeof window === "undefined" || !isApiCall(config.url)) return config;
  if (!config._skipAuthRefresh && CookieHelper.get({ key: REFRESH_TOKEN_COOKIE })) {
    await migrateLegacySession();
    // the request was built before the move: send what is current now (nothing once moved)
    const auth = config.headers.get("Authorization");
    if (typeof auth === "string" && auth.startsWith("Bearer")) {
      const now = legacyAuthorization();
      if (now) config.headers.set("Authorization", now);
      else config.headers.delete("Authorization");
    }
  }
  const auth = config.headers.get("Authorization");
  if (typeof auth === "string" && EMPTY_BEARER.test(auth.trim())) config.headers.delete("Authorization");
  // the login cookies travel with same-origin requests; the header marks the call as the website's
  config.withCredentials = true;
  config.headers.set(WEB_CLIENT_HEADER, WEB_CLIENT_VALUE);
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Access tokens expire; refresh once and replay the request before giving up.
      if (original && !original._retried && !original._skipAuthRefresh) {
        original._retried = true;
        if (await refreshOnce()) {
          const now = legacyAuthorization();
          if (now) original.headers.set("Authorization", now);
          else original.headers.delete("Authorization");
          return axios(original);
        }
      }
      if (!original?._skipAuthRefresh) {
        void clearSession();
        const path = window.location.pathname;
        const publicPaths = ["/login", "/register", "/otp", "/forget-password", "/change-password"];
        if (!publicPaths.some((p) => path.startsWith(p))) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

type AdapterOption = "fetch" | "axios";

export class Fetch {
  private static _baseUrl = apiBase();
  private static _adapter: AdapterOption = "axios";

  static setAdapter(adapter: AdapterOption) {
    this._adapter = adapter;
  }

  /** Options for the fetch adapter: same cookies and website header as the axios path. */
  private static fetchInit(header: any, init: RequestInit = {}): RequestInit {
    return {
      ...header,
      ...init,
      credentials: "include",
      headers: { ...(header?.headers ?? {}), [WEB_CLIENT_HEADER]: WEB_CLIENT_VALUE },
    };
  }

  static async get(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.get(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, this.fetchInit(header));
    return await res.json();
  }

  static async post(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.post(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, this.fetchInit(header, { method: "POST", body: data }));
    return await res.json();
  }

  static async put(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.put(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, this.fetchInit(header, { method: "PUT", body: data }));
    return await res.json();
  }

  static async patch(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.patch(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, this.fetchInit(header, { method: "PATCH", body: data }));
    return await res.json();
  }

  static async delete(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.delete(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, this.fetchInit(header, { method: "DELETE" }));
    return await res.json();
  }
}
