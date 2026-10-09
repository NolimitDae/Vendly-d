import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ContractCategory } from 'prisma/generated/client';
import { MAX_ADDITIONAL_TERMS } from '../contract-templates';

// read the raw input: the global implicit conversion turns any non-empty string into true
const toBool = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const value = obj[key];
  return value === true || value === 'true' || value === '1' || value === 1;
};

const toArray = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const value = obj[key];
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [value];
};

const toObject = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const value = obj[key];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value ?? {};
};

export class SignatureDto {
  @ApiProperty({ description: 'Typed full legal name' })
  @IsString()
  @Length(2, 255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  legal_name: string;

  @ApiProperty({ description: 'Must be true: agrees to sign and receive electronically' })
  @Transform(toBool)
  @Equals(true, { message: 'You must agree to sign electronically.' })
  consent: boolean;

  @ApiProperty({ description: 'SHA-256 of the contract content the signer reviewed' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  content_sha256: string;

  @ApiPropertyOptional({ description: 'Drawn signature as a PNG data URL' })
  @IsOptional()
  @IsString()
  @MaxLength(700_000)
  signature_image?: string;

  @ApiPropertyOptional({ description: 'Vendor: reuse the saved signature image' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  use_saved_signature?: boolean;

  @ApiPropertyOptional({ description: 'Vendor: save this drawn signature for future bookings' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  save_signature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  app_version?: string;

  @ApiPropertyOptional({ description: 'ios, android or web' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_platform?: string;
}

export class BookingContractFieldsDto {
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
  @IsDate()
  @Type(() => Date)
  event_start_at?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  event_end_at?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  venue_address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guest_count?: number;

  @ApiPropertyOptional({ description: 'Booking comments' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @ApiPropertyOptional({ description: 'Planner: event to attach this booking to' })
  @IsOptional()
  @IsString()
  event_id?: string;

  @ApiPropertyOptional({ description: 'IANA time zone of the signer, e.g. America/New_York' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class SignedBookingRequestDto extends BookingContractFieldsDto {
  @ApiProperty({ description: 'Token from the contract preview' })
  @IsString()
  preview_token: string;

  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}

export class VendorDefaultContractDto {
  @ApiProperty({ enum: ContractCategory })
  @IsEnum(ContractCategory)
  category: ContractCategory;

  @ApiProperty({ type: Object })
  @Transform(toObject)
  @IsObject()
  field_values: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ADDITIONAL_TERMS)
  additional_terms?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  applies_to_all?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  listing_ids?: string[];
}

export class VendorUploadContractDto {
  @ApiProperty({ description: 'Vendor confirms the contract is theirs and does not conflict with Vendly terms' })
  @Transform(toBool)
  @Equals(true, { message: 'Please confirm the contract is yours and does not conflict with the Vendly Terms of Service.' })
  confirm_ownership: boolean;

  @ApiProperty({ type: Object, description: 'business_legal_name, business_address, cancellation_policy' })
  @Transform(toObject)
  @IsObject()
  field_values: Record<string, string>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  applies_to_all?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  listing_ids?: string[];
}

export class AmendmentChangesDto {
  @IsOptional() @IsDate() @Type(() => Date) scheduled_at?: Date;
  @IsOptional() @IsDate() @Type(() => Date) event_start_at?: Date;
  @IsOptional() @IsDate() @Type(() => Date) event_end_at?: Date;
  @IsOptional() @IsString() @MaxLength(500) venue_address?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) guest_count?: number;
  @ApiPropertyOptional({ description: 'Vendor only' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @ApiPropertyOptional({ description: 'Vendor only: flexible, moderate or strict' })
  @IsOptional() @IsIn(['flexible', 'moderate', 'strict']) cancellation_policy?: string;
}

export class AmendmentPreviewDto {
  @ApiProperty({ type: AmendmentChangesDto })
  @ValidateNested()
  @Type(() => AmendmentChangesDto)
  changes: AmendmentChangesDto;

  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}

export class AmendmentRequestDto extends AmendmentPreviewDto {
  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}

export class SignContractDto {
  @ApiProperty({ type: SignatureDto })
  @ValidateNested()
  @Type(() => SignatureDto)
  signature: SignatureDto;
}

export class VendorConfirmDto {
  @ApiPropertyOptional({ type: SignatureDto, description: 'Required when the booking has a contract' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignatureDto)
  signature?: SignatureDto;
}

export class AdminTemplateDto {
  @ApiProperty({ enum: ContractCategory })
  @IsEnum(ContractCategory)
  category: ContractCategory;

  @ApiProperty()
  @IsString()
  @Length(3, 255)
  title: string;

  @ApiProperty()
  @IsString()
  @Length(50, 100_000)
  body: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  required_fields?: string[];
}

export class AdminDisableContractDto {
  @ApiProperty()
  @IsString()
  @Length(5, 2000)
  reason: string;
}
