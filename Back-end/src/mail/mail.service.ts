import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import appConfig from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTopic, wants } from '../common/helper/notification-prefs';

@Injectable()
export class MailService {
  constructor(
    @InjectQueue('mail-queue') private queue: Queue,
    private mailerService: MailerService,
    private prisma: PrismaService,
  ) {}

  /** Whether the account behind this address wants an optional email about `topic` (see notification-prefs). */
  private async wantsEmail(to: string, topic?: NotificationTopic) {
    if (!topic) return true;
    try {
      const user = await this.prisma.user.findUnique({ where: { email: to }, select: { notification_prefs: true } });
      return wants(user?.notification_prefs, topic, 'email');
    } catch {
      return true;
    }
  }

  async sendMemberInvitation({ user, member, url }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = `${user.fname} is inviting you to ${appConfig().app.name}`;

      // add to queue
      await this.queue.add('sendMemberInvitation', {
        to: member.email,
        from: from,
        subject: subject,
        template: 'member-invitation',
        context: {
          user: user,
          member: member,
          url: url,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  // send otp code for email verification
  async sendOtpCodeToEmail({ name, email, otp }) {
    try {
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      const subject = 'Email Verification';

      // add to queue
      await this.queue.add('sendOtpCodeToEmail', {
        to: email,
        from: from,
        subject: subject,
        template: 'email-verification',
        context: {
          name: name,
          otp: otp,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendVerificationLink(params: {
    email: string;
    name: string;
    token: string;
    type: string;
  }) {
    try {
      const q = new URLSearchParams({ token: params.token, email: params.email, type: params.type });
      const verificationLink = `${appConfig().app.client_app_url}/verify-email?${q.toString()}`;

      // add to queue
      await this.queue.add('sendVerificationLink', {
        to: params.email,
        subject: 'Verify Your Email',
        template: './verification-link',
        context: {
          name: params.name,
          verificationLink,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async sendBookingNotification(params: {
    to: string;
    recipientName: string;
    subject: string;
    message: string;
    status: string;
    listingTitle: string;
    scheduledAt?: string;
    amount?: number;
    reason?: string;
    ctaUrl?: string;
    /** button text (default "View Booking") */
    ctaLabel?: string;
    /** extra label / value rows, e.g. a receipt's card and date */
    lines?: { label: string; value: string }[];
    /** an optional email the recipient can turn off; leave out for receipts, refunds, disputes and contracts */
    topic?: NotificationTopic;
  }): Promise<boolean> {
    try {
      const { topic, ...context } = params;
      // turned off by the user: nothing to retry
      if (!(await this.wantsEmail(params.to, topic))) return true;
      const from = `${process.env.APP_NAME} <${appConfig().mail.from}>`;
      await this.queue.add('sendBookingNotification', {
        to: params.to,
        from,
        subject: params.subject,
        template: 'booking-notification',
        context,
      });
      return true;
    } catch (error) {
      console.log(error);
      // false when the email couldn't be queued, for callers that retry later (receipts, invoices)
      return false;
    }
  }
}
