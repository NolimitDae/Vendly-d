import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_BASE_FEE, MAX_FREE_MILES, MAX_PER_MILE } from 'src/modules/booking/travel-fee';
import { RentalItemStatus } from 'prisma/generated/enums';
import { MAX_DOS, MAX_DO_LENGTH, readFlag, readIncludedItems } from 'src/modules/vendor/listing/package-details';

/** Dos and don'ts on a rental item: short lines (a JSON array in multipart forms). */
class RentalInstructionsDto {
  @ApiPropertyOptional({ type: [String], description: 'Dos: how to use the equipment, one short line each' })
  @IsOptional()
  @Transform(({ obj, key }) => readIncludedItems(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_DOS, { message: `Add up to ${MAX_DOS} dos.` })
  @IsString({ each: true })
  @MaxLength(MAX_DO_LENGTH, { each: true, message: `Each do can be up to ${MAX_DO_LENGTH} characters.` })
  dos?: string[];

  @ApiPropertyOptional({ type: [String], description: "Don'ts: what not to do with the equipment, one short line each" })
  @IsOptional()
  @Transform(({ obj, key }) => readIncludedItems(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_DOS, { message: `Add up to ${MAX_DOS} don'ts.` })
  @IsString({ each: true })
  @MaxLength(MAX_DO_LENGTH, { each: true, message: `Each don't can be up to ${MAX_DO_LENGTH} characters.` })
  donts?: string[];
}

/** How the customer gets the item: the vendor delivers it, and/or the customer picks it up. */
class RentalHandoverDto extends RentalInstructionsDto {
  @ApiPropertyOptional({ description: 'The vendor delivers the item to the customer (default true)' })
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  offers_delivery?: boolean;

  @ApiPropertyOptional({ description: 'The customer can pick the item up from the vendor (default true)' })
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  offers_pickup?: boolean;
}

export class CreateRentalItemDto extends RentalHandoverDto {
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

export class UpdateRentalItemDto extends RentalHandoverDto {
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
  /** The delivery address (not for a pickup): priced for the vendor's delivery fee. */
  @ApiPropertyOptional({ description: 'The delivery address (not for a pickup)' }) @IsOptional() @IsString() @MaxLength(500) venue_address?: string;
  /** The customer picks the items up from the vendor (no delivery address). Older apps don't send it: no address then means a pickup. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  customer_comes?: boolean;
}

/** The vendor's delivery fee on rental orders (booking/travel-fee.ts): left out keeps what's saved. */
export class RentalDeliveryFeeDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() travel_fee_enabled?: boolean;
  @ApiPropertyOptional({ description: 'Miles that are free (empty = none)' })
  @IsOptional()
  @IsInt({ message: 'Free miles must be a whole number.' })
  @Min(0)
  @Max(MAX_FREE_MILES, { message: `Free miles can be up to ${MAX_FREE_MILES}.` })
  travel_free_miles?: number | null;
  @ApiPropertyOptional({ description: 'Price per mile after the free miles' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PER_MILE, { message: `The price per mile can be up to $${MAX_PER_MILE}.` })
  travel_per_mile?: number | null;
  @ApiPropertyOptional({ description: 'A flat amount on every delivered order (optional)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_BASE_FEE, { message: `The base delivery fee can be up to $${MAX_BASE_FEE}.` })
  travel_base_fee?: number | null;
  @ApiPropertyOptional({ description: 'Count the miles there and back' }) @IsOptional() @IsBoolean() travel_round_trip?: boolean;
}

export class RentalBookDto extends RentalQuoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) message?: string;
  /** Saved card charged when the vendor accepts (and held for the security deposit) */
  @ApiProperty() @IsString() payment_method_id: string;
}

/** Damage and late fees on one return, together (as for any one fee request). */
export const RETURN_FEES_MAX = 25_000;

export class RentalReturnDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(RETURN_FEES_MAX) damage_fee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(RETURN_FEES_MAX) late_fee?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  damage_reported?: boolean;
}
