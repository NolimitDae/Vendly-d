import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DISPUTE_CATEGORIES, DISPUTE_OUTCOMES } from 'src/modules/payments/dispute-files';

export class DisputeBookingDto {
  @ApiProperty({ description: 'What went wrong, in the customer’s words' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ enum: DISPUTE_CATEGORIES, description: 'What kind of problem' })
  @IsOptional()
  @IsIn(DISPUTE_CATEGORIES as unknown as string[])
  category?: string;

  @ApiPropertyOptional({ enum: DISPUTE_OUTCOMES, description: 'What the customer asks for' })
  @IsOptional()
  @IsIn(DISPUTE_OUTCOMES as unknown as string[])
  outcome?: string;

  @ApiPropertyOptional({ description: 'Partial refund asked for; no more than what was paid (checked against the booking)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  // a sanity bound only: the real limit is what was paid on the booking (PaymentsService.openDispute)
  @Max(1000000)
  requested_amount?: number;
}

export class RetryInstallmentDto {
  @ApiPropertyOptional({ description: 'Stripe PaymentMethod id of another saved card to use from now on' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  payment_method_id?: string;
}

export class DisputeReplyDto {
  @ApiProperty({ description: 'The vendor’s side of the dispute, read by Vendly' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reply: string;
}
