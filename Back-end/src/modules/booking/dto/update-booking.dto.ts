import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ALL_CANCEL_REASON_CODES } from '../cancel-reasons';

export class RejectBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional({
    enum: ALL_CANCEL_REASON_CODES,
    description:
      'Why, from the list for whoever cancels (GET /bookings/:id/cancel-preview lists them). Customers: plans_changed, found_another_vendor, event_cancelled, price, other. Vendors: customer_didnt_pay (only while a payment is overdue), safety_concern, emergency, double_booked, other. The apps always send one; apps from before the lists send none and count as other.',
  })
  @IsOptional()
  @IsIn(ALL_CANCEL_REASON_CODES, { message: 'Pick one of the reasons offered for cancelling.' })
  reason_code?: string;

  @ApiPropertyOptional({ description: 'Optional note the other side sees' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Older apps: their free-text reason, kept as the note' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
