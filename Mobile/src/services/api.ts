import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const USER_KEY = 'user';

export const api = axios.create({
  baseURL: `${BASE_URL.replace(/\/+$/, '')}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  // Don't overwrite an Authorization header the caller set explicitly (e.g. the /auth/me bootstrap).
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipAuthRefresh?: boolean };

// One refresh at a time: concurrent 401s wait for the same refresh instead of each starting their own.
let refreshing: Promise<string | null> | null = null;

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
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null;
        });
        const token = await refreshing;
        if (token) {
          original.headers.set('Authorization', `Bearer ${token}`);
          return api(original);
        }
      }
      await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
    }
    return Promise.reject(err);
  },
);
