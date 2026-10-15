import { api } from './api';
import type { AuthContextValue } from '../context/AuthContext';
import type { SignupRole } from '../navigation/types';

export type SocialProvider = 'google' | 'apple';
export interface SocialPending {
  provider: SocialProvider;
  id_token: string;
  name?: string;
}

/**
 * Trades a Google / Apple ID token for a Vendly session. A brand-new account comes back with
 * `needs_role`, so the app asks how they'll use Vendly and calls again with the role.
 */
export async function socialSignIn(pending: SocialPending, login: AuthContextValue['login'], role?: SignupRole): Promise<'signed_in' | 'needs_role'> {
  const res = await api.post('/auth/social', { ...pending, role });
  if (res.data?.needs_role) return 'needs_role';
  const auth = res.data?.authorization;
  if (!res.data?.success || !auth?.access_token) throw new Error(res.data?.message ?? 'Sign-in failed');
  const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${auth.access_token}` } });
  await login(auth.access_token, me.data?.data, auth.refresh_token);
  return 'signed_in';
}

/** OAuth client IDs from the build environment; Google sign-in is hidden behind "coming soon" without them. */
export const GOOGLE_IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
