import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AddOnKind, AddOnPriceUnit } from 'prisma/generated/enums';

export class CreateAddOnDto {
  @ApiPropertyOptional({ enum: AddOnKind, default: AddOnKind.ADD_ON })
  @IsOptional()
  @IsEnum(AddOnKind)
  kind?: AddOnKind;

  @ApiProperty({ example: 'Bartender' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  price: number;

  @ApiPropertyOptional({ enum: AddOnPriceUnit, default: AddOnPriceUnit.FIXED })
  @IsOptional()
  @IsEnum(AddOnPriceUnit)
  price_unit?: AddOnPriceUnit;

  @ApiPropertyOptional({ description: 'PER_ITEM only: the most a customer can pick' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  max_quantity?: number | null;

  @ApiPropertyOptional({ description: 'false = a custom add-on for the packages in listing_ids only', default: true })
  @IsOptional()
  @IsBoolean()
  in_library?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Packages to attach it to' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  listing_ids?: string[];
}

export class UpdateAddOnDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000) price?: number;
  @IsOptional() @IsEnum(AddOnPriceUnit) price_unit?: AddOnPriceUnit;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) max_quantity?: number | null;
  @ApiPropertyOptional({ description: 'Move a custom add-on into the library' })
  @IsOptional() @IsBoolean() in_library?: boolean;
}

export class BulkAttachDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  add_on_ids: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  listing_ids: string[];

  @ApiPropertyOptional({ enum: ['add', 'remove'], default: 'add' })
  @IsOptional()
  @IsIn(['add', 'remove'])
  mode?: 'add' | 'remove';
}

export class SetListingAddOnsDto {
  @ApiProperty({ type: [String], description: 'Every add-on and fee the package offers, in display order' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  add_on_ids: string[];
}

/** One add-on a customer picks when booking. */
export class AddOnSelectionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  add_on_id: string;

  @ApiPropertyOptional({ description: 'PER_ITEM add-ons only', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number;
}

export class AddOnSelectionListDto {
  @ApiPropertyOptional({ type: [AddOnSelectionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AddOnSelectionDto)
  add_ons?: AddOnSelectionDto[];
}

// ─── After booking ────────────────────────────────────────────────────────────

export class RequestExtraDto {
  @ApiProperty({ enum: AddOnKind })
  @IsEnum(AddOnKind)
  kind: AddOnKind;

  @ApiPropertyOptional({ description: 'From the vendor library; name and price default to it' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  add_on_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Price per unit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(100000)
  unit_price?: number;

  @ApiPropertyOptional({ enum: AddOnPriceUnit })
  @IsOptional()
  @IsEnum(AddOnPriceUnit)
  price_unit?: AddOnPriceUnit;

  @ApiPropertyOptional({ description: 'Hours, guests or items (half hours allowed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(10000)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Why, e.g. "Returned 3 hours late" or "Asked for an extra hour of music"' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DeclineExtraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class EscalateExtraDto {
  @ApiProperty({ description: 'Why the fee is owed (photos can be added as booking proof)' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  note: string;
}

export class ReviewExtraDto {
  @ApiProperty({ enum: ['charge', 'waive'] })
  @IsIn(['charge', 'waive'])
  action: 'charge' | 'waive';

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note: string;
}

export class GiveBackDto {
  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Sorry the setup started late' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
