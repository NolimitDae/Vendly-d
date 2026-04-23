import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';


export class CreateWithdrawDto {

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Minimum withdraw amount is 1 USD' })
  amount: number;

  @IsOptional()
  @IsString()
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
