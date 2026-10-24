import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { NotificationPrefKey } from 'src/common/helper/notification-prefs';

// keep the raw value: the global implicit conversion would turn the string "false" into true
const Switch = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({ type: Boolean, description }),
    IsOptional(),
    Transform(({ obj, key }) => obj[key]),
    IsBoolean({ message: 'Each setting must be true or false.' }),
  );

/** Any subset of the switches. Unknown keys are refused by the global validation pipe. */
export class UpdateNotificationPrefsDto implements Partial<Record<NotificationPrefKey, boolean>> {
  @Switch('Requests, confirmations, changes and cancellations')
  booking_updates?: boolean;

  @Switch('New quotes and chat invites')
  messages?: boolean;

  @Switch('Payment pushes. Receipt and refund emails are always sent.')
  payments?: boolean;

  @Switch('Nudges about requests and add-ons waiting for an answer')
  reminders?: boolean;

  @Switch('The ask to rate a finished booking')
  review_requests?: boolean;

  @Switch('Optional updates by email as well as push')
  email?: boolean;
}
