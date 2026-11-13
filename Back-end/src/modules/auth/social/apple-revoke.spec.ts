import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { appleClientSecret, exchangeAppleCode, revokeAppleToken } from './apple-revoke';

describe('Sign in with Apple revocation', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const env = { ...process.env };
  beforeEach(() => {
    process.env.APPLE_TEAM_ID = 'TEAM123';
    process.env.APPLE_KEY_ID = 'KEY456';
    // stored with \n in place of line breaks, as environment variables often are
    process.env.APPLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n');
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('signs the client secret Apple asks for with the Sign in with Apple key', () => {
    const secret = appleClientSecret('com.vendly.mobile', 1_000)!;
    const decoded = jwt.verify(secret, publicKey.export({ type: 'spki', format: 'pem' }).toString(), { algorithms: ['ES256'], ignoreExpiration: true, clockTimestamp: 1_000 }) as jwt.JwtPayload;
    expect(decoded).toMatchObject({ iss: 'TEAM123', sub: 'com.vendly.mobile', aud: 'https://appleid.apple.com', iat: 1_000, exp: 1_300 });
    expect(jwt.decode(secret, { complete: true })?.header).toMatchObject({ alg: 'ES256', kid: 'KEY456' });
  });

  it('trades the sign-in code for a refresh token, and revokes it', async () => {
    const fetchImpl = jest.fn(async (url: string, init: any) => {
      const body = new URLSearchParams(init.body);
      if (url.endsWith('/auth/token')) {
        expect(body.get('code')).toBe('c1');
        expect(body.get('grant_type')).toBe('authorization_code');
        return { ok: true, json: async () => ({ refresh_token: 'r1' }) } as any;
      }
      expect(url).toBe('https://appleid.apple.com/auth/revoke');
      expect(body.get('token')).toBe('r1');
      expect(body.get('token_type_hint')).toBe('refresh_token');
      return { ok: true } as any;
    });
    expect(await exchangeAppleCode('c1', 'com.vendly.mobile', fetchImpl as any)).toBe('r1');
    expect(await revokeAppleToken('r1', 'com.vendly.mobile', fetchImpl as any)).toBe(true);
  });

  it('does nothing until the Apple key is set up', async () => {
    delete process.env.APPLE_PRIVATE_KEY;
    const fetchImpl = jest.fn();
    expect(appleClientSecret('com.vendly.mobile')).toBeNull();
    expect(await exchangeAppleCode('c1', 'com.vendly.mobile', fetchImpl as any)).toBeNull();
    expect(await revokeAppleToken('r1', 'com.vendly.mobile', fetchImpl as any)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
