import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SocketService } from './socket.service';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const USER_KEY = 'user';
/** This phone's push token as last saved to the account, sent with sign-out so the pushes stop. */
export const PUSH_TOKEN_KEY = 'push_token';

export const api = axios.create({
  baseURL: `${BASE_URL.replace(/\/+$/, '')}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/** How long a multipart upload (photos, documents) may take. */
export const UPLOAD_TIMEOUT_MS = 120_000;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipAuthRefresh?: boolean };

/** True when the JWT expires within 30s (or can't be read, so the server decides). */
export function expiresSoon(token: string, now = Date.now()): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return typeof exp === 'number' && exp * 1000 < now + 30_000;
  } catch {
    return false;
  }
}

api.interceptors.request.use(async (config) => {
  let token = await AsyncStorage.getItem(TOKEN_KEY);
  // Uploads can't rely on the 401 retry below: the server rejects before reading the body and iOS reports a
  // dropped connection instead of the 401. So swap a token that's about to expire before sending.
  if (token && !(config as RetriableConfig)._skipAuthRefresh && expiresSoon(token)) token = (await refreshOnce()) ?? token;
  // Don't overwrite an Authorization header the caller set explicitly (e.g. the /auth/me bootstrap).
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  // Photo uploads over a phone connection can take well over 15 s; give them two minutes.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && (config.timeout ?? 0) < UPLOAD_TIMEOUT_MS) config.timeout = UPLOAD_TIMEOUT_MS;
  return config;
});

// One refresh at a time: concurrent 401s wait for the same refresh instead of each starting their own.
let refreshing: Promise<string | null> | null = null;
function refreshOnce() {
  refreshing ??= refreshAccessToken().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Trades the stored refresh token for a new access token (and a rotated refresh token). Null if that fails. */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  try {
    const res = await api.post('/auth/refresh-token', { refresh_token: refreshToken }, {
      _skipAuthRefresh: true,
    } as RetriableConfig);
    const auth = res.data?.authorization;
    if (res.data?.success && auth?.access_token) {
      await AsyncStorage.setItem(TOKEN_KEY, auth.access_token);
      if (auth.refresh_token) await AsyncStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);
      return auth.access_token;
    }
  } catch {
    // fall through to sign-out
  }
  return null;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as RetriableConfig | undefined;
    if (err.response?.status === 401) {
      // Access tokens expire; refresh once and replay the request before signing out.
      if (original && !original._retried && !original._skipAuthRefresh) {
        original._retried = true;
        const token = await refreshOnce();
        if (token) {
          original.headers.set('Authorization', `Bearer ${token}`);
          return api(original);
        }
      }
      SocketService.disconnect();
      await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
    }
    return Promise.reject(err);
  },
);
