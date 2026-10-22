import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SwitchRoleDto {
  @ApiProperty({ enum: ['CUSTOMER', 'CLIENT', 'VENDOR', 'EVENT_PLANNER'] })
  @IsIn(['CUSTOMER', 'CLIENT', 'VENDOR', 'EVENT_PLANNER'], { message: 'Choose customer, vendor or planner.' })
  role: string;

  @ApiPropertyOptional({ description: 'Business name, used when becoming a vendor for the first time' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  business_name?: string;
}
