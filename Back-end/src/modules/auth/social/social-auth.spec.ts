import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { SocialAuthService } from './social-auth.service';
import { __resetAppleKeys, verifyApple, verifyGoogle } from './social-tokens';

const okJson = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe('social tokens', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_IDS = 'web.apps.googleusercontent.com,ios.apps.googleusercontent.com';
    process.env.APPLE_CLIENT_IDS = 'com.vendly.app';
    __resetAppleKeys();
  });

  describe('google', () => {
    const info = (over: Record<string, string> = {}) => ({ aud: 'ios.apps.googleusercontent.com', iss: 'https://accounts.google.com', sub: 'g-123', email: 'Ada@Gmail.com', email_verified: 'true', name: 'Ada Obi', exp: String(Math.floor(Date.now() / 1000) + 600), ...over });

    it('accepts a token for one of our client ids', async () => {
      const id = await verifyGoogle('tok', jest.fn(() => okJson(info())) as any);
      expect(id).toEqual({ provider: 'google', sub: 'g-123', email: 'ada@gmail.com', email_verified: true, name: 'Ada Obi' });
    });

    it('rejects tokens for other apps, expired tokens and unconfigured servers', async () => {
      await expect(verifyGoogle('tok', jest.fn(() => okJson(info({ aud: 'someone-else' }))) as any)).rejects.toThrow(/not meant for Vendly/);
      await expect(verifyGoogle('tok', jest.fn(() => okJson(info({ exp: '1000' }))) as any)).rejects.toThrow(/expired/);
      process.env.GOOGLE_CLIENT_IDS = '';
      delete process.env.GOOGLE_APP_ID;
      await expect(verifyGoogle('tok', jest.fn() as any)).rejects.toThrow(/not set up/);
    });
  });

  describe('apple', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
    const keys = jest.fn(() => okJson({ keys: [jwk] }));
    const sign = (claims: Record<string, unknown>, opts: jwt.SignOptions = {}) =>
      jwt.sign({ email: 'ada@privaterelay.appleid.com', email_verified: 'true', ...claims }, privateKey, { algorithm: 'RS256', keyid: 'k1', issuer: 'https://appleid.apple.com', audience: 'com.vendly.app', subject: 'a-001', expiresIn: 600, ...opts });

    it('verifies the signature against Apple’s published key', async () => {
      const id = await verifyApple(sign({}), keys as any);
      expect(id).toMatchObject({ provider: 'apple', sub: 'a-001', email: 'ada@privaterelay.appleid.com', email_verified: true });
    });

    it('rejects a token for another app or signed by someone else', async () => {
      await expect(verifyApple(sign({}, { audience: 'com.other.app' }), keys as any)).rejects.toThrow(/could not confirm/);
      const forger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      const forged = jwt.sign({ email: 'x@y.com' }, forger, { algorithm: 'RS256', keyid: 'k1', issuer: 'https://appleid.apple.com', audience: 'com.vendly.app', subject: 'a-001' });
      await expect(verifyApple(forged, keys as any)).rejects.toThrow(/could not confirm/);
    });
  });
});

jest.mock('./social-tokens', () => {
  const actual = jest.requireActual('./social-tokens');
  return { ...actual, verifyGoogle: jest.fn(actual.verifyGoogle), verifyApple: jest.fn(actual.verifyApple) };
});
import * as tokens from './social-tokens';

describe('SocialAuthService', () => {
  const prisma: any = {
    account: { findUnique: jest.fn(), create: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const users: any = { createUser: jest.fn() };
  const auth: any = { login: jest.fn().mockResolvedValue({ success: true, authorization: { access_token: 'jwt' } }) };
  const service = new SocialAuthService(prisma, users, auth);
  const identity = { provider: 'google' as const, sub: 'g-123', email: 'ada@gmail.com', email_verified: true, name: 'Ada Obi' };
  const active = { id: 'u1', email: 'ada@gmail.com', status: 1, deleted_at: null, email_verified_at: null, type: 'CLIENT' };

  beforeEach(() => {
    jest.clearAllMocks();
    (tokens.verifyGoogle as jest.Mock).mockResolvedValue(identity);
    prisma.user.findUnique.mockResolvedValue(active);
  });

  it('signs in an already linked account', async () => {
    prisma.account.findUnique.mockResolvedValue({ user_id: 'u1' });
    await expect(service.signIn({ provider: 'google', id_token: 't' })).resolves.toMatchObject({ success: true });
    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { email_verified_at: expect.any(Date) } });
    expect(auth.login).toHaveBeenCalledWith({ email: 'ada@gmail.com', userId: 'u1' });
  });

  it('links an existing email account the first time', async () => {
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    await service.signIn({ provider: 'google', id_token: 't' });
    expect(prisma.account.create).toHaveBeenCalledWith({ data: { user_id: 'u1', type: 'oauth', provider: 'google', provider_account_id: 'g-123' } });
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('asks a brand-new user for a role, then creates the account', async () => {
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.signIn({ provider: 'google', id_token: 't' })).resolves.toMatchObject({ needs_role: true });
    users.createUser.mockResolvedValue({ success: true, data: { id: 'u2' } });
    prisma.user.findUnique.mockResolvedValue({ ...active, id: 'u2' });
    await service.signIn({ provider: 'google', id_token: 't', role: 'VENDOR' });
    expect(users.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@gmail.com', name: 'Ada Obi', type: 'VENDOR' }));
    expect(auth.login).toHaveBeenCalledWith({ email: 'ada@gmail.com', userId: 'u2' });
  });

  it('refuses suspended accounts and admins, and unverified emails', async () => {
    prisma.account.findUnique.mockResolvedValue({ user_id: 'u1' });
    prisma.user.findUnique.mockResolvedValueOnce({ ...active, status: 0 });
    await expect(service.signIn({ provider: 'google', id_token: 't' })).rejects.toThrow(/suspended/);
    prisma.user.findUnique.mockResolvedValueOnce({ ...active, type: 'ADMIN' });
    await expect(service.signIn({ provider: 'google', id_token: 't' })).rejects.toThrow(/Admins/);
    prisma.account.findUnique.mockResolvedValue(null);
    (tokens.verifyGoogle as jest.Mock).mockResolvedValue({ ...identity, email_verified: false });
    await expect(service.signIn({ provider: 'google', id_token: 't' })).rejects.toThrow(/isn’t verified/);
  });

  it('turns token problems into a 401', async () => {
    (tokens.verifyGoogle as jest.Mock).mockRejectedValue(new tokens.SocialTokenError('Google could not confirm this sign-in. Try again.'));
    await expect(service.signIn({ provider: 'google', id_token: 't' })).rejects.toMatchObject({ status: 401 });
  });
});
