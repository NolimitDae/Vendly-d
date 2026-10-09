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
};

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
    it('should return tokens and store the refresh token', async () => {
      mockUserRepo.getUserDetails.mockResolvedValue(mockUser);

      const result: any = await service.login({ email: 'jane@test.com', userId: 'user-1' });

      expect(result.success).toBe(true);
      expect(result.authorization).toEqual({ type: 'bearer', access_token: 'mock-token', refresh_token: 'mock-token' });
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { email: 'jane@test.com', sub: 'user-1', type: 'CUSTOMER' },
        expect.any(Object),
      );
      expect(mockRedis.set).toHaveBeenCalledWith('refresh_token:user-1', 'mock-token', 'EX', 604800);
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
    it('should issue new access token with valid refresh token', async () => {
      mockRedis.get.mockResolvedValue('valid-refresh');
      mockUserRepo.getUserDetails.mockResolvedValue(mockUser);

      const result: any = await service.refreshToken('user-1', 'valid-refresh');
      expect(result.success).toBe(true);
      expect(result.authorization.access_token).toBe('mock-token');
    });

    it('should reject a refresh token that does not match the stored one', async () => {
      mockRedis.get.mockResolvedValue('stored-token');

      const result: any = await service.refreshToken('user-1', 'wrong-token');
      expect(result.success).toBe(false);
      expect(mockJwt.sign).not.toHaveBeenCalled();
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

    it('should reject an unknown email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.validateUser('nobody@test.com', 'any')).rejects.toThrow(UnauthorizedException);
    });
  });
});
