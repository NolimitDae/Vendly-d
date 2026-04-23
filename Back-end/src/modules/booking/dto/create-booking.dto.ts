import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  listing_id: string;

  @ApiProperty()
  @IsString()
  vendor_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduled_at?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
