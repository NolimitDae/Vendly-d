import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { UserRepository } from 'src/common/repository/user/user.repository';
import { UcodeRepository } from 'src/common/repository/ucode/ucode.repository';
import * as bcrypt from 'bcrypt';
import { IdentityService } from '../identity/identity.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockUser = {
  id: 'user-1',
  name: 'Jane Doe',
  email: 'jane@test.com',
  password: 'hashed-password',
  is_email_verified: true,
  two_factor_enabled: false,
  two_factor_secret: null,
  type: 'CUSTOMER',
};

const mockUserRepo = {
  getUserDetails: jest.fn(),
  exist: jest.fn(),
  validatePassword: jest.fn(),
};

const mockUcodeRepo = {
  createToken: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn().mockReturnValue({ userId: 'user-1' }),
};

const mockMail = {
  sendOtpCodeToEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationLink: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  uCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  eval: jest.fn().mockResolvedValue(1),
  sadd: jest.fn().mockResolvedValue(1),
  srem: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(1),
};

/** A tiny Redis (get/set/del, and the rotate script's compare-and-swap) for the refresh tests. */
function memoryRedis() {
  const store = new Map<string, { value: string; ttl?: number }>();
  mockRedis.get.mockImplementation(async (k: string) => store.get(k)?.value ?? null);
  mockRedis.set.mockImplementation(async (k: string, value: string, _ex?: string, ttl?: number) => {
    store.set(k, { value, ttl });
    return 'OK';
  });
  mockRedis.del.mockImplementation(async (...keys: string[]) => keys.filter((k) => store.delete(k)).length);
  const sets = new Map<string, Set<string>>();
  mockRedis.sadd.mockImplementation(async (k: string, v: string) => void (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(v));
  mockRedis.srem.mockImplementation(async (k: string, v: string) => void sets.get(k)?.delete(v));
  mockRedis.smembers.mockImplementation(async (k: string) => [...(sets.get(k) ?? [])]);
  mockRedis.eval.mockImplementation(async (_script: string, _n: number, current: string, previous: string, presented: string, next: string, ttl: number, grace: number) => {
    if (store.get(current)?.value !== presented) return 0;
    store.set(current, { value: next, ttl });
    store.set(previous, { value: presented, ttl: grace });
    return 1;
  });
  return store;
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwt },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: UcodeRepository, useValue: mockUcodeRepo },
        { provide: IdentityService, useValue: { status: jest.fn(), purgeForUser: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('me', () => {
    it('should return user data for valid userId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Jane Doe', email: 'jane@test.com', avatar: null, type: 'CUSTOMER' });

      const result: any = await service.me('user-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
    });

    it('should report an unknown userId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result: any = await service.me('bad-id');
      expect(result).toEqual({ success: false, message: 'User not found' });
    });
  });

  describe('login', () => {
    it('should return tokens and store the refresh token as a new session', async () => {
      mockUserRepo.getUserDetails.mockResolvedValue(mockUser);

      const result: any = await service.login({ email: 'jane@test.com', userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.authorization).toEqual({ type: 'bearer', access_token: 'mock-token', refresh_token: 'mock-token' });
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { email: 'jane@test.com', sub: 'user-1', type: 'CUSTOMER', sid: expect.stringMatching(/^[0-9a-f]{24}$/) },
        expect.any(Object),
      );
      const sid = mockJwt.sign.mock.calls[0][0].sid;
      expect(mockRedis.set).toHaveBeenCalledWith(`refresh_token:user-1:${sid}`, 'mock-token', 'EX', 604800);
      expect(mockRedis.sadd).toHaveBeenCalledWith('refresh_sessions:user-1', sid);
    });

    describe('one session per device', () => {
      beforeEach(() => mockUserRepo.getUserDetails.mockResolvedValue(mockUser));
      afterEach(() => {
        mockJwt.verify.mockReturnValue({ userId: 'user-1' });
        mockJwt.sign.mockImplementation(() => 'mock-token');
      });

      /** Signs in and returns the session id and refresh token it was given. */
      async function signIn(n: number) {
        mockJwt.sign.mockImplementation((p: any) => (p.typ === 'refresh' ? `refresh-${n}` : `access-${n}`));
        await service.login({ email: 'jane@test.com', userId: 'user-1' });
        return { sid: mockJwt.sign.mock.calls.at(-1)![0].sid as string, refresh: `refresh-${n}` };
      }
      const refreshWith = (d: { sid: string; refresh: string }) => {
        mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', typ: 'refresh', sid: d.sid });
        return service.refreshToken(d.refresh) as Promise<any>;
      };

      it('signing in on a second device keeps the first one signed in', async () => {
        memoryRedis();
        const phone = await signIn(1);
        const laptop = await signIn(2);
        expect(phone.sid).not.toBe(laptop.sid);
        mockJwt.sign.mockImplementation((p: any) => (p.typ === 'refresh' ? 'rotated' : 'a'));
        expect((await refreshWith(phone)).success).toBe(true);
        expect((await refreshWith(laptop)).success).toBe(true);
        // the rotated tokens stay in their own sessions
        expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sid: phone.sid, typ: 'refresh' }), expect.anything());
      });

      it('signing out ends only that device', async () => {
        const store = memoryRedis();
        const phone = await signIn(1);
        const laptop = await signIn(2);
        await service.revokeRefreshToken('user-1', phone.sid);
        expect((await refreshWith(phone)).success).toBe(false);
        expect(store.has(`refresh_token:user-1:${laptop.sid}`)).toBe(true);
        expect((await refreshWith(laptop)).success).toBe(true);
      });

      it('switching roles renews the same session instead of starting another', async () => {
        memoryRedis();
        await service.login({ email: 'jane@test.com', userId: 'user-1', sid: 'abc' });
        expect(mockJwt.sign).toHaveBeenLastCalledWith(expect.objectContaining({ sid: 'abc', typ: 'refresh' }), expect.anything());
      });

      it('deleting the account ends every session and the old single slot', async () => {
        const store = memoryRedis();
        const phone = await signIn(1);
        const laptop = await signIn(2);
        store.set('refresh_token:user-1', { value: 'legacy' });
        (mockUserRepo as any).deleteUser = jest.fn().mockResolvedValue({ success: true });
        await service.deleteAccount('user-1');
        expect([...store.keys()]).toEqual([]);
        expect((await refreshWith(phone)).success).toBe(false);
        expect((await refreshWith(laptop)).success).toBe(false);
      });

      it('reads the session from either token for sign-out', () => {
        mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', sid: 's1' });
        expect(service.sessionFromTokens({ access: 'a' })).toEqual({ userId: 'user-1', sid: 's1' });
        mockJwt.verify.mockReturnValueOnce({ sub: 'user-1' });
        expect(service.sessionFromTokens({ access: 'old' })).toEqual({ userId: 'user-1' });
      });
    });
  });

  describe('forgotPassword', () => {
    it('should send OTP when user exists', async () => {
      mockUserRepo.exist.mockResolvedValue({ id: 'user-1', name: 'Jane Doe' });
      mockUcodeRepo.createToken.mockResolvedValue('123456');

      const result: any = await service.forgotPassword('jane@test.com');
      expect(result.success).toBe(true);
      expect(mockMail.sendOtpCodeToEmail).toHaveBeenCalledWith({ email: 'jane@test.com', name: 'Jane Doe', otp: '123456' });
    });

    it('gives the same answer for unknown emails, so accounts cannot be discovered', async () => {
      mockUserRepo.exist.mockResolvedValue(null);

      const known: any = await (async () => {
        mockUserRepo.exist.mockResolvedValueOnce({ id: 'user-1', name: 'Jane' });
        mockUcodeRepo.createToken.mockResolvedValueOnce('1');
        return service.forgotPassword('jane@test.com');
      })();
      const unknown: any = await service.forgotPassword('nobody@test.com');

      expect(unknown).toEqual(known);
      expect(mockMail.sendOtpCodeToEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshToken', () => {
    it('authenticates with the refresh token alone and rotates it', async () => {
      const store = memoryRedis();
      store.set('refresh_token:user-1', { value: 'valid-refresh' });
      mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', typ: 'refresh' });
      mockJwt.sign.mockReturnValueOnce('new-access').mockReturnValueOnce('new-refresh');
      mockUserRepo.getUserDetails.mockResolvedValue(mockUser);

      const result: any = await service.refreshToken('valid-refresh');
      expect(result.success).toBe(true);
      expect(result.authorization.access_token).toBe('new-access');
      expect(result.authorization.refresh_token).toBe('new-refresh');
      // new refresh token is stored (rotation) and marked as a refresh token; the old one is kept 30 s
      expect(store.get('refresh_token:user-1')).toEqual({ value: 'new-refresh', ttl: 604800 });
      expect(store.get('refresh_token_prev:user-1')).toEqual({ value: 'valid-refresh', ttl: 30 });
      expect(mockJwt.sign).toHaveBeenCalledWith(expect.objectContaining({ typ: 'refresh' }), expect.anything());
    });

    describe('two tabs refreshing at once', () => {
      beforeEach(() => {
        mockUserRepo.getUserDetails.mockResolvedValue(mockUser);
        mockJwt.verify.mockReturnValue({ sub: 'user-1', typ: 'refresh' });
      });
      afterEach(() => mockJwt.verify.mockReturnValue({ userId: 'user-1' }));

      it('lets the token just replaced in, with the current refresh token and no second rotation', async () => {
        const store = memoryRedis();
        store.set('refresh_token:user-1', { value: 'r1' });
        mockJwt.sign.mockReturnValueOnce('a2').mockReturnValueOnce('r2');
        const first: any = await service.refreshToken('r1');
        expect(first.authorization).toMatchObject({ access_token: 'a2', refresh_token: 'r2' });

        // the other tab still had r1
        mockJwt.sign.mockReturnValueOnce('a3').mockReturnValueOnce('never-used');
        const second: any = await service.refreshToken('r1');
        expect(second.success).toBe(true);
        expect(second.authorization).toEqual({ type: 'bearer', access_token: 'a3', refresh_token: 'r2' });
        expect(store.get('refresh_token:user-1')?.value).toBe('r2');
        expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      });

      it('handles both arriving before either rotated: one rotates, the other gets its token', async () => {
        const store = memoryRedis();
        store.set('refresh_token:user-1', { value: 'r1' });
        let n = 0;
        mockJwt.sign.mockImplementation(() => `t${++n}`);
        const [a, b]: any[] = await Promise.all([service.refreshToken('r1'), service.refreshToken('r1')]);
        mockJwt.sign.mockImplementation(() => 'mock-token');
        expect(a.success && b.success).toBe(true);
        const current = store.get('refresh_token:user-1')!.value;
        expect(a.authorization.refresh_token).toBe(current);
        expect(b.authorization.refresh_token).toBe(current);
      });

      it('refuses an older token, the replaced one after the grace window, and any after sign-out', async () => {
        const store = memoryRedis();
        store.set('refresh_token:user-1', { value: 'r3' });
        store.set('refresh_token_prev:user-1', { value: 'r2' });
        expect(((await service.refreshToken('r1')) as any).success).toBe(false);
        store.delete('refresh_token_prev:user-1'); // 30 seconds later
        expect(((await service.refreshToken('r2')) as any).success).toBe(false);

        store.set('refresh_token_prev:user-1', { value: 'r2' });
        await service.revokeRefreshToken('user-1');
        expect(store.has('refresh_token:user-1') || store.has('refresh_token_prev:user-1')).toBe(false);
        expect(((await service.refreshToken('r2')) as any).success).toBe(false);
        expect(((await service.refreshToken('r3')) as any).success).toBe(false);
      });
    });

    it('rejects a refresh token that does not match the stored one', async () => {
      mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', typ: 'refresh' });
      mockRedis.get.mockResolvedValue('stored-token');

      const result: any = await service.refreshToken('wrong-token');
      expect(result.success).toBe(false);
      expect(mockJwt.sign).not.toHaveBeenCalled();
    });

    it('rejects an access token presented as a refresh token', async () => {
      mockJwt.verify.mockReturnValueOnce({ sub: 'user-1' });

      const result: any = await service.refreshToken('an-access-token');
      expect(result.success).toBe(false);
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('rejects an expired or forged refresh token', async () => {
      mockJwt.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      const result: any = await service.refreshToken('expired');
      expect(result.success).toBe(false);
    });

    it('refuses to refresh a deleted account', async () => {
      mockJwt.verify.mockReturnValueOnce({ sub: 'user-1', typ: 'refresh' });
      mockRedis.get.mockResolvedValue('valid-refresh');
      mockUserRepo.getUserDetails.mockResolvedValue({ ...mockUser, deleted_at: new Date() });

      const result: any = await service.refreshToken('valid-refresh');
      expect(result.success).toBe(false);
    });
  });

  describe('get2FAStatus', () => {
    it('should return enabled status', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ is_two_factor_enabled: 1 });

      const result: any = await service.get2FAStatus('user-1');
      expect(result.data.enabled).toBe(true);
    });

    it('should return disabled status', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ is_two_factor_enabled: 0 });

      const result: any = await service.get2FAStatus('user-1');
      expect(result.data.enabled).toBe(false);
    });
  });

  describe('validateUser', () => {
    const verified = { ...mockUser, email_verified_at: new Date(), is_two_factor_enabled: 0 };

    it('should return the user without the password for valid credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(verified);
      mockUserRepo.validatePassword.mockResolvedValue(true);

      const result = await service.validateUser('jane@test.com', 'password');
      expect(result.id).toBe('user-1');
      expect(result.password).toBeUndefined();
    });

    it('should reject a wrong password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(verified);
      mockUserRepo.validatePassword.mockResolvedValue(false);

      await expect(service.validateUser('jane@test.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an unverified email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...verified, email_verified_at: null });
      mockUserRepo.validatePassword.mockResolvedValue(true);

      await expect(service.validateUser('jane@test.com', 'password')).rejects.toThrow(/verify your email/);
    });

    it('should reject a suspended account', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...verified, status: 0 });
      mockUserRepo.validatePassword.mockResolvedValue(true);

      await expect(service.validateUser('jane@test.com', 'password')).rejects.toThrow(/suspended/);
    });

    it('should reject an unknown email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.validateUser('nobody@test.com', 'any')).rejects.toThrow(UnauthorizedException);
    });

    it('gives the same answer for an unknown email and a wrong password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const unknown = await service.validateUser('nobody@test.com', 'any').catch((e) => e.message);
      mockPrisma.user.findFirst.mockResolvedValue(verified);
      mockUserRepo.validatePassword.mockResolvedValue(false);
      const wrong = await service.validateUser('jane@test.com', 'wrong').catch((e) => e.message);
      expect(unknown).toBe('Email or password is incorrect');
      expect(wrong).toBe(unknown);
    });
  });
  describe('notification settings', () => {
    it('reads every switch as on until the user changes it', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notification_prefs: null });
      const res = await service.notificationPrefs('user-1');
      expect(res.data).toEqual({ booking_updates: true, messages: true, payments: true, reminders: true, review_requests: true, email: true });
    });

    it('changes only the switches sent and saves the full set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notification_prefs: { messages: false } });
      const res = await service.updateNotificationPrefs('user-1', { review_requests: false });
      const saved = { booking_updates: true, messages: false, payments: true, reminders: true, review_requests: false, email: true };
      expect(res.data).toEqual(saved);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { notification_prefs: saved } });
    });
  });
});
