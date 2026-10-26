import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OptionPriceMode } from 'prisma/generated/enums';
import { MAX_GROUP_TITLE, MAX_OPTION_GROUPS, MAX_OPTION_LABEL, MAX_OPTION_PRICE, MAX_OPTIONS_PER_GROUP } from '../package-options';

export class PackageOptionDto {
  @ApiPropertyOptional({ description: 'An existing option to keep (new options have none)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ example: 'Knotless' })
  @IsString()
  @MaxLength(MAX_OPTION_LABEL, { message: `Keep each option to ${MAX_OPTION_LABEL} characters.` })
  label: string;

  @ApiPropertyOptional({ example: 20, description: 'Upcharge (0 or empty = no upcharge)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_OPTION_PRICE)
  price?: number;

  @ApiPropertyOptional({ enum: OptionPriceMode, default: OptionPriceMode.FLAT, description: 'FLAT: added once; PER_UNIT: × guests, hours or days' })
  @IsOptional()
  @IsEnum(OptionPriceMode)
  price_mode?: OptionPriceMode;
}

export class PackageOptionGroupDto {
  @ApiPropertyOptional({ description: 'An existing customization to keep (new ones have none)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ example: 'Style' })
  @IsString()
  @MaxLength(MAX_GROUP_TITLE, { message: `Keep each customization title to ${MAX_GROUP_TITLE} characters.` })
  title: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 1, description: '1 = pick one; 2 or more = pick up to this many' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OPTIONS_PER_GROUP)
  max_select?: number;

  @ApiProperty({ type: [PackageOptionDto] })
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS_PER_GROUP, { message: `Each customization can have up to ${MAX_OPTIONS_PER_GROUP} options.` })
  @ValidateNested({ each: true })
  @Type(() => PackageOptionDto)
  options: PackageOptionDto[];
}

export class SetPackageOptionsDto {
  @ApiProperty({ type: [PackageOptionGroupDto], description: 'Every customization on the package, in display order' })
  @IsArray()
  @ArrayMaxSize(MAX_OPTION_GROUPS, { message: `A package can have up to ${MAX_OPTION_GROUPS} customizations.` })
  @ValidateNested({ each: true })
  @Type(() => PackageOptionGroupDto)
  groups: PackageOptionGroupDto[];
}

/** What a customer picked for one customization when booking. */
export class OptionChoiceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  group_id: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS_PER_GROUP)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  option_ids: string[];
}
