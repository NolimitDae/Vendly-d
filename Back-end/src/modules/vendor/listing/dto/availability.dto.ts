import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class BlockDatesDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsDate()
  @Type(() => Date)
  start_date: Date;

  @ApiProperty({ example: '2026-11-05' })
  @IsDate()
  @Type(() => Date)
  end_date: Date;

  @ApiPropertyOptional({ example: 'Personal holiday' })
  @IsOptional()
  @IsString()
  reason?: string;
}
