import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { AppConfig } from "../config/app.config";
import { CookieHelper } from "../helper/cookie.helper";
import { REFRESH_TOKEN_COOKIE, clearSession, saveSession } from "./session";

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipAuthRefresh?: boolean };

// One refresh at a time: concurrent 401s wait for the same refresh instead of each starting their own.
let refreshing: Promise<string | null> | null = null;

/** Trades the refresh token for a new access token (and a rotated refresh token). Null if that fails. */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = CookieHelper.get({ key: REFRESH_TOKEN_COOKIE });
  if (!refreshToken) return null;
  try {
    const res = await axios.post(
      `${AppConfig().app.apiUrl}/auth/refresh-token`,
      { refresh_token: refreshToken },
      { _skipAuthRefresh: true } as RetriableConfig,
    );
    const auth = res.data?.authorization;
    if (res.data?.success && auth?.access_token) {
      saveSession(auth.access_token, auth.refresh_token);
      return auth.access_token;
    }
  } catch {
    // fall through to sign-out
  }
  return null;
}

axios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Access tokens expire; refresh once and replay the request before giving up.
      if (original && !original._retried && !original._skipAuthRefresh) {
        original._retried = true;
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null;
        });
        const token = await refreshing;
        if (token) {
          original.headers.set("Authorization", `Bearer ${token}`);
          return axios(original);
        }
      }
      clearSession();
      const path = window.location.pathname;
      const publicPaths = ["/login", "/register", "/otp", "/forget-password", "/change-password"];
      if (!publicPaths.some((p) => path.startsWith(p))) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

type AdapterOption = "fetch" | "axios";

export class Fetch {
  private static _baseUrl = `${AppConfig().app.apiUrl}`;
  private static _adapter: AdapterOption = "axios";

  static setAdapter(adapter: AdapterOption) {
    this._adapter = adapter;
  }

  static async get(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.get(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, header);
    return await res.json();
  }

  static async post(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.post(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "POST", body: data });
    return await res.json();
  }

  static async put(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.put(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "PUT", body: data });
    return await res.json();
  }

  static async patch(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.patch(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "PATCH", body: data });
    return await res.json();
  }

  static async delete(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.delete(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "DELETE" });
    return await res.json();
  }
}
