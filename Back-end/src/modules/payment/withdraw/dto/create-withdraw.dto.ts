import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';


export class CreateWithdrawDto {

  @IsNotEmpty()
  @IsNumber()
  @Min(20, { message: 'Minimum withdraw amount is $20' })
  amount: number;

 // the wallet holds US dollars only, so payouts are in US dollars too
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['usd'], { message: 'Withdrawals are in US dollars (usd) only.' })
  currency?: string = 'usd';

}


export class CreateConnectedAccountDto {
  @IsOptional()
  @IsString()
  country?: string = 'US';
}


export interface WithdrawResponse {
  success: boolean;
  message: string;
  data?: {
    transfer_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
  };
}
