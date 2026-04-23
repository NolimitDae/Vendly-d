import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDepositDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
