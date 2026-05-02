import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribeDto {
  @ApiProperty({ example: 'starter', description: 'Plan ID: free_trial | starter | pro | elite | premium' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 'monthly', enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  billing: 'monthly' | 'yearly';
}
