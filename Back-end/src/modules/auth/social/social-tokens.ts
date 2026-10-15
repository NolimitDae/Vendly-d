import { createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Verifies ID tokens from Google and Apple sign-in (native apps hand us the token; we never see a
 * password). No SDKs: Google's tokeninfo endpoint and Apple's published signing keys.
 */

export interface SocialIdentity {
  provider: 'google' | 'apple';
  sub: string;
  email: string | null;
  email_verified: boolean;
  name?: string | null;
}

export class SocialTokenError extends Error {}

const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Client IDs our apps sign in with (web, iOS and Android OAuth clients). */
export const googleAudiences = () => list(process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_APP_ID);
/** The iOS bundle id (and web Services ID, if used). */
export const appleAudiences = () => list(process.env.APPLE_CLIENT_IDS);

export async function verifyGoogle(idToken: string, fetchImpl: typeof fetch = fetch): Promise<SocialIdentity> {
  const audiences = googleAudiences();
  if (!audiences.length) throw new SocialTokenError('Google sign-in is not set up yet.');
  const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new SocialTokenError('Google could not confirm this sign-in. Try again.');
  const t = (await res.json()) as Record<string, string>;
  if (!audiences.includes(t.aud)) throw new SocialTokenError('This Google sign-in was not meant for Vendly.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) throw new SocialTokenError('Invalid Google token.');
  if (Number(t.exp) * 1000 < Date.now()) throw new SocialTokenError('The Google sign-in expired. Try again.');
  return { provider: 'google', sub: t.sub, email: t.email?.toLowerCase() ?? null, email_verified: t.email_verified === 'true', name: t.name ?? null };
}

let appleKeys: { at: number; keys: any[] } | null = null;
async function appleKey(kid: string, fetchImpl: typeof fetch) {
  if (!appleKeys || Date.now() - appleKeys.at > 6 * 3600 * 1000 || !appleKeys.keys.some((k) => k.kid === kid)) {
    const res = await fetchImpl('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new SocialTokenError('Apple sign-in is unavailable right now. Try again.');
    appleKeys = { at: Date.now(), keys: ((await res.json()) as { keys: any[] }).keys };
  }
  const jwk = appleKeys.keys.find((k) => k.kid === kid);
  if (!jwk) throw new SocialTokenError('Invalid Apple token.');
  return createPublicKey({ key: jwk, format: 'jwk' });
}

export async function verifyApple(idToken: string, fetchImpl: typeof fetch = fetch): Promise<SocialIdentity> {
  const audiences = appleAudiences();
  if (!audiences.length) throw new SocialTokenError('Apple sign-in is not set up yet.');
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw new SocialTokenError('Invalid Apple token.');
  const key = await appleKey(header.kid, fetchImpl);
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(idToken, key, { algorithms: ['RS256'], issuer: 'https://appleid.apple.com', audience: audiences as [string, ...string[]] }) as jwt.JwtPayload;
  } catch {
    throw new SocialTokenError('Apple could not confirm this sign-in. Try again.');
  }
  return {
    provider: 'apple',
    sub: String(claims.sub),
    // Apple sends the email only on the first sign-in (and may relay it through privaterelay.appleid.com)
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null,
    email_verified: claims.email_verified === true || claims.email_verified === 'true',
  };
}

/** Test hook: forget cached Apple keys. */
export const __resetAppleKeys = () => {
  appleKeys = null;
};
