import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { RentalItemStatus } from 'prisma/generated/enums';

export class CreateRentalItemDto {
  @ApiProperty() @IsString() @MaxLength(255) title: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.5) daily_rate: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit_amount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) turnaround_hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) location?: string;
  @ApiPropertyOptional({ enum: RentalItemStatus }) @IsOptional() @IsEnum(RentalItemStatus) status?: RentalItemStatus;
}

export class UpdateRentalItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) daily_rate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit_amount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) turnaround_hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) location?: string;
  @ApiPropertyOptional({ enum: RentalItemStatus }) @IsOptional() @IsEnum(RentalItemStatus) status?: RentalItemStatus;
  /** Existing image file names (or URLs) to keep; anything else is removed. Omit to keep all. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? (value.startsWith('[') ? JSON.parse(value) : [value]) : value))
  @IsArray()
  keep_images?: string[];
}

export class RentalLineDto {
  @ApiProperty() @IsString() item_id: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) quantity: number;
}

export class RentalQuoteDto {
  @ApiProperty({ type: [RentalLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RentalLineDto)
  lines: RentalLineDto[];

  @ApiProperty({ example: '2026-11-10' }) @IsDateString() start_date: string;
  @ApiProperty({ example: '2026-11-12' }) @IsDateString() end_date: string;
}

export class RentalBookDto extends RentalQuoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) venue_address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) message?: string;
  /** Saved card charged when the vendor accepts (and held for the security deposit) */
  @ApiProperty() @IsString() payment_method_id: string;
}

export class RentalReturnDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) damage_fee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) late_fee?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  damage_reported?: boolean;
}
