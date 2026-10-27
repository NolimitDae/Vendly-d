import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateDepositDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;

  // the wallet holds US dollars only
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['usd'], { message: 'Deposits are in US dollars (usd) only.' })
  currency?: string;
}
