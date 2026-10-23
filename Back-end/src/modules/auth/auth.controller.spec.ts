import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { ExecutionContext } from '@nestjs/common';

const mockAuthService = {
  me: jest.fn().mockResolvedValue({ id: 1, name: 'Test User' }),
  register: jest.fn().mockResolvedValue({ success: true }),
  login: jest.fn().mockResolvedValue({
    authorization: { access_token: 'access', refresh_token: 'refresh' },
    user: { id: 1, email: 'test@example.com' },
  }),
  refreshToken: jest.fn().mockResolvedValue({ authorization: { access_token: 'new_access' } }),
  revokeRefreshToken: jest.fn().mockResolvedValue({ success: true }),
  updateUser: jest.fn().mockResolvedValue({ success: true }),
  forgotPassword: jest.fn().mockResolvedValue({ success: true }),
  verifyEmail: jest.fn().mockResolvedValue({ success: true }),
  resendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  resetPassword: jest.fn().mockResolvedValue({ success: true }),
  changePassword: jest.fn().mockResolvedValue({ success: true }),
  requestEmailChange: jest.fn().mockResolvedValue({ success: true }),
  changeEmail: jest.fn().mockResolvedValue({ success: true }),
  generate2FASecret: jest.fn().mockResolvedValue({ success: true, qrCode: 'base64' }),
  verify2FA: jest.fn().mockResolvedValue({ success: true }),
  enable2FA: jest.fn().mockResolvedValue({ success: true }),
  disable2FA: jest.fn().mockResolvedValue({ success: true }),
};

// Fake user injection
const mockUserRequest = {
  user: {
    userId: 1,
    email: 'test@example.com',
  },
};

// Mock JWT Guard
const mockJwtAuthGuard = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    req.user = mockUserRequest.user;
    return true;
  },
};

// Mock LocalAuthGuard
const mockLocalAuthGuard = {
  canActivate: () => true,
  handleRequest: () => mockUserRequest.user,
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(LocalAuthGuard)
      .useValue(mockLocalAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should register a user', async () => {
    const dto = {
      name: 'John Doe',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      password: 'password',
      type: 'CLIENT',
    };
    const result = await controller.create(dto as any, undefined);
    expect(result.success).toBe(true);
  });

  it('refuses to self-register an admin account', async () => {
    mockAuthService.register.mockClear();
    const dto = { first_name: 'Eve', last_name: 'X', email: 'eve@example.com', password: 'password', type: 'ADMIN' };
    const result = await controller.create(dto as any, undefined);
    expect(result.success).toBe(false);
    expect(mockAuthService.register).not.toHaveBeenCalled();
  });

  it('should return current user info', async () => {
    const result = await controller.me({ user: { userId: 1 } } as any) as any;
    expect(result.id).toBe(1);
  });

  const resMock = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  const webHeaders = { 'x-requested-with': 'vendly-web' };

  it('logs the app in with tokens in the body and no cookies', async () => {
    const res = resMock();
    const result: any = await controller.login({ user: mockUserRequest.user, headers: {} } as any, res as any);
    expect(result.authorization).toEqual({ access_token: 'access', refresh_token: 'refresh' });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('logs the website in with HttpOnly cookies and keeps the tokens out of the body', async () => {
    const res = resMock();
    const result: any = await controller.login({ user: mockUserRequest.user, headers: webHeaders } as any, res as any);
    expect(result.authorization).toEqual({ type: 'cookie' });
    expect(JSON.stringify(result)).not.toContain('access');
    expect(res.cookie).toHaveBeenCalledWith('vendly_session', 'access', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
    expect(res.cookie).toHaveBeenCalledWith('vendly_refresh', 'refresh', expect.objectContaining({ httpOnly: true, path: '/api/auth' }));
    expect(res.cookie).toHaveBeenCalledWith('vendly_logged_in', '1', expect.objectContaining({ httpOnly: false }));
  });

  it('should refresh token', async () => {
    const result = await controller.refreshToken({ headers: {} } as any, resMock() as any, { refresh_token: 'refresh' });
    expect(mockAuthService.refreshToken).toHaveBeenCalledWith('refresh');
    expect(result.authorization.access_token).toBe('new_access');
  });

  it('refreshes the website from its cookie, only with the website header', async () => {
    mockAuthService.refreshToken.mockClear();
    const cookie = 'vendly_refresh=r-cookie; vendly_session=old';
    await controller.refreshToken({ headers: { cookie } } as any, resMock() as any, {});
    expect(mockAuthService.refreshToken).toHaveBeenLastCalledWith('');
    await controller.refreshToken({ headers: { cookie, ...webHeaders } } as any, resMock() as any, {});
    expect(mockAuthService.refreshToken).toHaveBeenLastCalledWith('r-cookie');
  });

  it('logs the app out with its Bearer token', async () => {
    (mockAuthService as any).userFromTokens = jest.fn().mockReturnValue('u1');
    const res = resMock();
    const result = await controller.logout({ headers: { authorization: 'Bearer app-token' }, method: 'POST' } as any, res as any, {});
    expect((mockAuthService as any).userFromTokens).toHaveBeenCalledWith({ access: 'app-token', refresh: null });
    expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith('u1');
    expect(result.success).toBe(true);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('clears the website cookies on logout, even when the session already expired', async () => {
    (mockAuthService as any).userFromTokens = jest.fn().mockReturnValue(null);
    const res = resMock();
    const result = await controller.logout({ headers: { cookie: 'vendly_session=x', ...webHeaders }, method: 'POST' } as any, res as any, {});
    expect(result.success).toBe(true);
    const cleared = res.clearCookie.mock.calls.map((c) => c[0]);
    expect(cleared).toEqual(expect.arrayContaining(['vendly_session', 'vendly_refresh', 'vendly_logged_in', 'token', 'refresh_token']));
  });

  it('refuses a cookie-only logout without the website header', async () => {
    await expect(
      controller.logout({ headers: { cookie: 'vendly_session=x' }, method: 'POST' } as any, resMock() as any, {}),
    ).rejects.toThrow('X-Requested-With');
  });

  it('should update user', async () => {
    const result = await controller.updateUser(
      { user: { userId: 1 } } as any,
      {},
      {} as any,
    );
    expect(result.success).toBe(true);
  });

  it('should handle forgot password', async () => {
    const result = await controller.forgotPassword({ email: 'john@example.com' });
    expect(result.success).toBe(true);
  });

  it('should verify email', async () => {
    const result = await controller.verifyEmail({ email: 'john@example.com', token: '1234' });
    expect(result.success).toBe(true);
  });

  it('should resend verification email', async () => {
    const result = await controller.resendVerificationEmail({ email: 'john@example.com' });
    expect(result.success).toBe(true);
  });

  it('should reset password', async () => {
    const result = await controller.resetPassword({
      email: 'john@example.com',
      token: '1234',
      password: 'newpass123',
    });
    expect(result.success).toBe(true);
  });

  it('refuses a reset to a password shorter than 8 characters', async () => {
    const result = await controller.resetPassword({ email: 'john@example.com', token: '1234', password: 'short' });
    expect(result).toMatchObject({ success: false, message: expect.stringMatching(/8 characters/) });
  });

  it('should change password', async () => {
    const result = await controller.changePassword(
      { user: { userId: 1 } } as any,
      { email: 'john@example.com', old_password: 'oldpass', new_password: 'newpass' },
    );
    expect(result.success).toBe(true);
  });

  it('should request email change', async () => {
    const result = await controller.requestEmailChange(
      { user: { userId: 1 } } as any,
      { email: 'new@example.com' },
    );
    expect(result.success).toBe(true);
  });

  it('should change email', async () => {
    const result = await controller.changeEmail(
      { user: { userId: 1 } } as any,
      { email: 'new@example.com', token: 'token123' },
    );
    expect(result.success).toBe(true);
  });

  it('should generate 2FA secret', async () => {
    const result = await controller.generate2FASecret({ user: { userId: 1 } } as any);
    expect(result.success).toBe(true);
  });

  it('should verify 2FA token', async () => {
    const result = await controller.verify2FA(
      { user: { userId: 1 } } as any,
      { token: '123456' },
    );
    expect(result.success).toBe(true);
  });

  it('should enable 2FA', async () => {
    const result = await controller.enable2FA({ user: { userId: 1 } } as any);
    expect(result.success).toBe(true);
  });

  it('should disable 2FA', async () => {
    const result = await controller.disable2FA({ user: { userId: 1 } } as any);
    expect(result.success).toBe(true);
  });
});
