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
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockUcodeRepo = {
  create: jest.fn(),
  findByEmailAndToken: jest.fn(),
  deleteByEmail: jest.fn(),
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
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.me('user-1');
      expect(result).toBeDefined();
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });

    it('should throw NotFoundException for unknown userId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.me('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('login', () => {
    it('should return tokens on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.login({ email: 'jane@test.com', userId: 'user-1' });

      expect(result).toBeDefined();
      expect(mockJwt.sign).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should send OTP when user exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.uCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.uCode.create.mockResolvedValue({ token: '123456' });

      await service.forgotPassword('jane@test.com');
      expect(mockMail.sendOtpCodeToEmail).toHaveBeenCalled();
    });

    it('should not reveal whether email exists (no throw)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.forgotPassword('nobody@test.com')).resolves.not.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should issue new access token with valid refresh token', async () => {
      mockRedis.get.mockResolvedValue('valid-refresh');
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refreshToken('user-1', 'valid-refresh');
      expect(result).toBeDefined();
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      mockRedis.get.mockResolvedValue('stored-token');

      await expect(service.refreshToken('user-1', 'wrong-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('get2FAStatus', () => {
    it('should return enabled status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        two_factor_enabled: true,
      });

      const result = await service.get2FAStatus('user-1');
      expect(result.data.enabled).toBe(true);
    });

    it('should return disabled status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.get2FAStatus('user-1');
      expect(result.data.enabled).toBe(false);
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('jane@test.com', 'password');
      expect(result).not.toBeNull();
    });

    it('should return null for wrong password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('jane@test.com', 'wrong');
      expect(result).toBeNull();
    });

    it('should return null for unknown email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser('nobody@test.com', 'any');
      expect(result).toBeNull();
    });
  });
});
