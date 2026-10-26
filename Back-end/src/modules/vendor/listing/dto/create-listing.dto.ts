import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentPlan } from 'prisma/generated/enums';
import { ListingStatus } from 'prisma/generated/client';
import { Transform, Type } from 'class-transformer';
import { SERVICE_AT, type ServiceAt } from 'src/modules/booking/booking-tracker';
import { MAX_DOS, MAX_DO_LENGTH, MAX_INCLUDED_ITEMS, MAX_INCLUDED_ITEM_LENGTH, MAX_MIN_NOTICE_HOURS, readIncludedItems, readNoticeHours } from '../package-details';

export class CreateVendorListingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ default: 'fixed' })
  @IsOptional()
  @IsString()
  price_unit?: string;

  @ApiPropertyOptional({ enum: ListingStatus, default: ListingStatus.DRAFT })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Map position of `location`, when picked from address suggestions (skips geocoding)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ description: 'Miles the vendor travels from `location` (0 = customers come to them)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(250)
  service_radius_miles?: number;

  @ApiPropertyOptional({ enum: SERVICE_AT, default: 'CUSTOMER_LOCATION', description: 'Where the service happens: at the customer’s place, or the customer comes to the vendor’s business address' })
  @IsOptional()
  @IsIn(SERVICE_AT)
  service_at?: ServiceAt;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  delivery_time?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sub_category_id?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Per person / hour / day packages: the fewest guests, hours or days a customer can book (0 = no minimum)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  min_quantity?: number;

  @ApiPropertyOptional({ description: 'Per person / hour / day packages: the most guests, hours or days (0 = no maximum)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  max_quantity?: number;

  @ApiPropertyOptional({ enum: PaymentPlan, description: 'How customers pay; defaults to the category setting, else full payment on accept' })
  @IsOptional()
  @IsEnum(PaymentPlan)
  payment_plan?: PaymentPlan;

  @ApiPropertyOptional({ type: [String], description: "What's included, one short line each (a JSON array in multipart forms)" })
  @IsOptional()
  // the raw value: implicit conversion would mangle a JSON string
  @Transform(({ obj, key }) => readIncludedItems(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_INCLUDED_ITEMS, { message: `Add up to ${MAX_INCLUDED_ITEMS} included items.` })
  @IsString({ each: true })
  @MaxLength(MAX_INCLUDED_ITEM_LENGTH, { each: true, message: `Each included item can be up to ${MAX_INCLUDED_ITEM_LENGTH} characters.` })
  included_items?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Dos: how to use the equipment, one short line each (a JSON array in multipart forms)' })
  @IsOptional()
  @Transform(({ obj, key }) => readIncludedItems(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_DOS, { message: `Add up to ${MAX_DOS} dos.` })
  @IsString({ each: true })
  @MaxLength(MAX_DO_LENGTH, { each: true, message: `Each do can be up to ${MAX_DO_LENGTH} characters.` })
  dos?: string[];

  @ApiPropertyOptional({ type: [String], description: "Don'ts: what not to do with the equipment, one short line each (a JSON array in multipart forms)" })
  @IsOptional()
  @Transform(({ obj, key }) => readIncludedItems(obj[key]))
  @IsArray()
  @ArrayMaxSize(MAX_DOS, { message: `Add up to ${MAX_DOS} don'ts.` })
  @IsString({ each: true })
  @MaxLength(MAX_DO_LENGTH, { each: true, message: `Each don't can be up to ${MAX_DO_LENGTH} characters.` })
  donts?: string[];

  @ApiPropertyOptional({ description: 'How many hours ahead the package must be booked (0 or empty = no minimum)' })
  @IsOptional()
  @Transform(({ obj, key }) => readNoticeHours(obj[key]))
  @IsInt()
  @Min(0)
  @Max(MAX_MIN_NOTICE_HOURS, { message: 'Minimum notice can be up to 90 days.' })
  min_notice_hours?: number | null;
}
