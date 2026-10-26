import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { getQueueToken } from '@nestjs/bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';

const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
const mockMailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
const mockPrisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: getQueueToken('mail-queue'), useValue: mockQueue },
        { provide: MailerService, useValue: mockMailer },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendBookingNotification', () => {
    const params = { to: 'a@x.com', recipientName: 'Amara', subject: 'Receipt', message: 'Thanks', status: 'RECEIPT', listingTitle: 'Buffet' };

    it('says whether the email was queued', async () => {
      expect(await service.sendBookingNotification(params)).toBe(true);
      mockQueue.add.mockRejectedValueOnce(new Error('redis down'));
      jest.spyOn(console, 'log').mockImplementationOnce(() => undefined);
      expect(await service.sendBookingNotification(params)).toBe(false);
    });

    it('skips an optional email the user turned off, but always sends a receipt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notification_prefs: { review_requests: false, payments: false, email: false } });
      expect(await service.sendBookingNotification({ ...params, subject: 'How was it?', topic: 'review_requests' })).toBe(true);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@x.com' }, select: { notification_prefs: true, is_test: true } });

      await service.sendBookingNotification(params);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith('sendBookingNotification', expect.objectContaining({ to: 'a@x.com', subject: 'Receipt' }));
    });

    it('sends an optional email when the user wants it, without the topic in the template', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ notification_prefs: null });
      await service.sendBookingNotification({ ...params, topic: 'booking_updates' });
      expect(mockQueue.add.mock.calls[0][1].context).not.toHaveProperty('topic');
    });

    it('still sends when the settings cannot be read', async () => {
      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
      expect(await service.sendBookingNotification({ ...params, topic: 'reminders' })).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('test accounts', () => {
    it('never emails a @vendly.test address or a test vendor, whatever the email', async () => {
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
      const params = { to: 'test-catering-food-1@vendly.test', recipientName: 'Test', subject: 'Receipt', message: 'Thanks', status: 'RECEIPT', listingTitle: 'Buffet' };
      // nothing to retry: it counts as handled
      expect(await service.sendBookingNotification(params)).toBe(true);
      await service.sendOtpCodeToEmail({ name: 'Test', email: 'TEST-x-1@Vendly.Test', otp: '123456' });
      await service.sendVerificationLink({ name: 'Test', email: 'test-x-1@vendly.test', token: 't', type: 'verify' });
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Not emailing test account test-catering-food-1@vendly.test');

      // a test vendor whose address was changed to a real-looking one
      mockPrisma.user.findUnique.mockResolvedValueOnce({ notification_prefs: null, is_test: true });
      await service.sendBookingNotification({ ...params, to: 'someone@gmail.com' });
      expect(mockQueue.add).not.toHaveBeenCalled();

      mockPrisma.user.findUnique.mockResolvedValueOnce({ notification_prefs: null, is_test: false });
      await service.sendBookingNotification({ ...params, to: 'someone@gmail.com' });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });
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
        expect.objectContaining({
          to: 'jane@test.com',
          template: 'email-verification',
          context: expect.objectContaining({ name: 'Jane', otp: '123456' }),
        }),
      );
    });
  });

  describe('sendVerificationLink', () => {
    it('should add verification link job to queue', async () => {
      await service.sendVerificationLink({
        name: 'Jane',
        email: 'jane+test@test.com',
        token: 'abc',
        type: 'verify',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'sendVerificationLink',
        expect.objectContaining({
          to: 'jane+test@test.com',
          context: expect.objectContaining({
            verificationLink: expect.stringContaining('token=abc&email=jane%2Btest%40test.com&type=verify'),
          }),
        }),
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
        expect.objectContaining({ to: 'member@test.com', template: 'member-invitation' }),
      );
    });
  });
});
