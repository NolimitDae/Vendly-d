import * as jwt from 'jsonwebtoken';

/**
 * Sign in with Apple: when someone deletes their Vendly account, Apple requires the app to revoke the
 * Apple sign-in too (App Store guideline 5.1.1(v)). That needs a refresh token, which the app's one-time
 * authorization code is traded for at sign-in, and a client secret signed with a "Sign in with Apple"
 * key from the Apple Developer account:
 *   APPLE_TEAM_ID       the team ID (developer.apple.com > Membership)
 *   APPLE_KEY_ID        the key's ID (Certificates, IDs & Profiles > Keys, with Sign in with Apple)
 *   APPLE_PRIVATE_KEY   the key file's contents (.p8; line breaks may be written as \n)
 * Without them nothing is exchanged or revoked, and sign-in and deletion work as before.
 */

const APPLE = 'https://appleid.apple.com';

export function appleRevokeConfigured() {
  return !!(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

/** The short-lived client secret Apple's token endpoints ask for, for this client (the app's bundle id). */
export function appleClientSecret(clientId: string, now = Math.floor(Date.now() / 1000)): string | null {
  if (!appleRevokeConfigured()) return null;
  const key = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
  return jwt.sign({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: APPLE, sub: clientId }, key, {
    algorithm: 'ES256',
    keyid: process.env.APPLE_KEY_ID,
  });
}

/** Trades the app's one-time authorization code for a refresh token (kept to revoke later). Null if it can't. */
export async function exchangeAppleCode(code: string, clientId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const secret = appleClientSecret(clientId);
  if (!secret || !code) return null;
  const res = await fetchImpl(`${APPLE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' }).toString(),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { refresh_token?: string };
  return body.refresh_token ?? null;
}

/** Revokes an Apple sign-in (on account deletion). True when Apple accepted it. */
export async function revokeAppleToken(refreshToken: string, clientId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = appleClientSecret(clientId);
  if (!secret || !refreshToken) return false;
  const res = await fetchImpl(`${APPLE}/auth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, token: refreshToken, token_type_hint: 'refresh_token' }).toString(),
  });
  return res.ok;
}
