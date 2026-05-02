import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { getQueueToken } from '@nestjs/bullmq';
import { MailerService } from '@nestjs-modules/mailer';

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
const mockMailer = { sendMail: jest.fn().mockResolvedValue(undefined) };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: getQueueToken('mail-queue'), useValue: mockQueue },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendOtpCodeToEmail', () => {
    it('should add job to the mail queue', async () => {
      await service.sendOtpCodeToEmail({
        name: 'Jane',
        email: 'jane@test.com',
        otp: '123456',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sendOtpCodeToEmail',
        expect.objectContaining({ email: 'jane@test.com', otp: '123456' }),
        expect.any(Object),
      );
    });
  });

  describe('sendVerificationLink', () => {
    it('should add verification link job to queue', async () => {
      await service.sendVerificationLink({
        name: 'Jane',
        email: 'jane@test.com',
        url: 'https://vendly.com/verify?token=abc',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sendVerificationLink',
        expect.objectContaining({ email: 'jane@test.com' }),
        expect.any(Object),
      );
    });
  });

  describe('sendMemberInvitation', () => {
    it('should add member invitation job to queue', async () => {
      await service.sendMemberInvitation({
        user: { name: 'Admin' },
        member: { name: 'New Member', email: 'member@test.com' },
        url: 'https://vendly.com/invite/token',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sendMemberInvitation',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
