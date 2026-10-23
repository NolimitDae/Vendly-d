import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DisputeBookingDto {
  @ApiProperty({ description: 'What went wrong, in the customer’s words' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
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
