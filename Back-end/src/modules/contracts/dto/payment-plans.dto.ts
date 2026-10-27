import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_PLAN_PAYMENTS } from 'src/modules/payments/custom-plan';
import { MAX_NOTE } from '../request-changes';
import { SignatureDto } from './contracts.dto';

/** One payment of a proposed plan (rules in payments/custom-plan.ts). */
export class PlanPaymentDto {
  @ApiProperty({ description: 'Amount charged, Vendly Protection fee included on the first payment' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @ApiPropertyOptional({ description: 'When it is charged. Leave out on the first payment for "when you accept" (a request) or "now" (a confirmed booking)' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  due_at?: Date | null;
}

/** The payments of a proposed plan, in order. */
export class PaymentPlanInputDto {
  @ApiProperty({ type: [PlanPaymentDto] })
  @IsArray()
  @ArrayMaxSize(MAX_PLAN_PAYMENTS)
  @ValidateNested({ each: true })
  @Type(() => PlanPaymentDto)
  payments: PlanPaymentDto[];
}

/** A payment plan the vendor proposes on a confirmed booking, for the payments not made yet. */
export class PaymentPlanProposalDto extends PaymentPlanInputDto {
  @ApiPropertyOptional({ description: 'A short note to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE)
  note?: string;
}

export class SendPaymentPlanDto extends PaymentPlanProposalDto {
  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}
