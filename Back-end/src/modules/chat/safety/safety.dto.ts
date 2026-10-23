import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const REPORT_REASONS = ['spam', 'harassment', 'scam', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export class ReportUserDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) reported_id: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS as unknown as string[])
  reason: ReportReason;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) details?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) conversation_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) message_id?: string;

  @ApiPropertyOptional({ description: 'Also block the person' })
  @IsOptional()
  @IsBoolean()
  block?: boolean;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'actioned'] })
  @IsIn(['dismiss', 'actioned'])
  action: 'dismiss' | 'actioned';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
