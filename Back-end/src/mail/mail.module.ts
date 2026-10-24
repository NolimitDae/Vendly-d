import { MailerModule, MailerOptions } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { MailService } from './mail.service';
import appConfig from '../config/app.config';
import { BullModule } from '@nestjs/bullmq';
import { MailProcessor } from './processors/mail.processor';
import { resendTransport } from './resend.transport';

@Global()
@Module({
  imports: [
    MailerModule.forRoot({
      // transport: 'smtps://user@example.com:topsecret@smtp.example.com',
      // or
      transport: appConfig().mail.resendApiKey ? resendTransport(appConfig().mail.resendApiKey) : {
        host: appConfig().mail.host,
        port: +appConfig().mail.port,
        secure: false,
        auth: {
          user: appConfig().mail.user,
          pass: appConfig().mail.password,
        },
      },
      // message defaults; nodemailer 10's own types leave message fields such as `from` off the
      // transport options type this module declares here, but nodemailer still applies them
      defaults: {
        from: appConfig().mail.from,
      } as MailerOptions['defaults'],
      template: {
        // dir: join(__dirname, 'templates'),
        dir: process.cwd() + '/dist/mail/templates/',
        // adapter: new HandlebarsAdapter(), // or new PugAdapter() or new EjsAdapter()
        adapter: new EjsAdapter(),
        options: {
          // strict: true,
        },
      },
    }),
    BullModule.registerQueue({
      name: 'mail-queue',
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
