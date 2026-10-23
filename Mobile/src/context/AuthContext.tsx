import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserType =
  | 'CUSTOMER'
  | 'VENDOR'
  | 'EVENT_PLANNER'
  | 'ADMIN'
  | 'PROVIDER'
  | 'EDITOR'
  | 'CLIENT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  type: UserType;
  avatar_url?: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** True while the initial AsyncStorage + /auth/me bootstrap is running */
  loading: boolean;
}

export interface AuthContextValue extends AuthState {
  /** Store token, persist user from the caller (e.g. freshly received login response). */
  login: (token: string, user: AuthUser, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch /auth/me and update stored user (e.g. after profile edit). */
  refreshUser: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'RESTORE'; user: AuthUser; token: string }
  | { type: 'LOGIN'; user: AuthUser; token: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; user: AuthUser }
  | { type: 'SET_LOADING'; loading: boolean };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'RESTORE':
      return { user: action.user, token: action.token, loading: false };
    case 'LOGIN':
      return { user: action.user, token: action.token, loading: false };
    case 'LOGOUT':
      return { user: null, token: null, loading: false };
    case 'UPDATE_USER':
      return { ...state, user: action.user };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    user: null,
    token: null,
    loading: true,
  });

  // On mount: restore token from storage, then validate with GET /auth/me.
  // Using /auth/me (not just the cached user JSON) ensures:
  //   1. The token hasn't expired / been revoked.
  //   2. user.type is always fresh — routing depends on it.
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (!storedToken) {
          dispatch({ type: 'SET_LOADING', loading: false });
          return;
        }

        // Attach token so the interceptor picks it up for this call.
        const res = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        if (res.data?.success) {
          const user: AuthUser = res.data.data;
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
          dispatch({ type: 'RESTORE', user, token: storedToken });
        } else {
          await clearStorage();
          dispatch({ type: 'SET_LOADING', loading: false });
        }
      } catch (err: any) {
        // 401 → token invalid; network error → keep the user logged in
        // (avoid logging people out on flaky networks).
        if (err?.response?.status === 401) {
          await clearStorage();
          dispatch({ type: 'SET_LOADING', loading: false });
        } else {
          // Fall back to cached user so the app is usable offline.
          const cachedUser = await AsyncStorage.getItem(USER_KEY);
          const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
          if (cachedUser && storedToken) {
            dispatch({
              type: 'RESTORE',
              user: JSON.parse(cachedUser) as AuthUser,
              token: storedToken,
            });
          } else {
            dispatch({ type: 'SET_LOADING', loading: false });
          }
        }
      }
    })();
  }, []);

  const login = useCallback(async (token: string, user: AuthUser, refreshToken?: string) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      refreshToken ? AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken) : Promise.resolve(),
    ]);
    dispatch({ type: 'LOGIN', user, token });
  }, []);

  const logout = useCallback(async () => {
    // end this device's session on the server too (other devices stay signed in); never blocks sign-out
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY).catch(() => null);
    if (refreshToken) await api.post('/auth/logout', { refresh_token: refreshToken }, { timeout: 5000, _skipAuthRefresh: true } as object).catch(() => undefined);
    await clearStorage();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.success) {
        const user: AuthUser = res.data.data;
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        dispatch({ type: 'UPDATE_USER', user });
      }
    } catch {
      // Silently fail — stale data is better than crashing.
    }
  }, []);

  // Coming back to the app re-reads the account, so a role switched on the website (or an ID
  // approved meanwhile) shows up without closing the app. At most once every 30 seconds.
  const lastRefresh = useRef(0);
  const signedIn = !!state.token;
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || Date.now() - lastRefresh.current < 30_000) return;
      lastRefresh.current = Date.now();
      refreshUser();
    });
    return () => sub.remove();
  }, [signedIn, refreshUser]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function clearStorage() {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
}
