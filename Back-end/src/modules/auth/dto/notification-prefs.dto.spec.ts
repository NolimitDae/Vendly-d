import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateNotificationPrefsDto } from './notification-prefs.dto';

// the same options as the global pipe in main.ts
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } });
const check = (body: unknown) => pipe.transform(body, { type: 'body', metatype: UpdateNotificationPrefsDto });

describe('UpdateNotificationPrefsDto', () => {
  it('accepts any subset of the known switches', async () => {
    await expect(check({ messages: false, email: true })).resolves.toEqual({ messages: false, email: true });
    await expect(check({})).resolves.toEqual({});
  });

  it('refuses unknown keys, such as an SMS switch that does not exist', async () => {
    await expect(check({ sms: false })).rejects.toThrow(BadRequestException);
  });

  it('refuses anything but true or false', async () => {
    await expect(check({ reminders: 'false' })).rejects.toThrow(BadRequestException);
    await expect(check({ reminders: 0 })).rejects.toThrow(BadRequestException);
  });
});
