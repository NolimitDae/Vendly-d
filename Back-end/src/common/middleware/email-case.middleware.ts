import { Injectable, NestMiddleware } from '@nestjs/common';
import { EMAIL_BODY_FIELDS, normalizeEmail } from '../helper/email';

/**
 * Lower-cases account emails in JSON and form bodies before guards run, so sign-up, login, password
 * reset and verification all agree however the email was typed (iOS often capitalises the first letter).
 */
@Injectable()
export class EmailCaseMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const body = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const field of EMAIL_BODY_FIELDS) {
        if (typeof body[field] === 'string') body[field] = normalizeEmail(body[field]);
      }
    }
    next();
  }
}
