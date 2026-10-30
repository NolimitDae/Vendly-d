import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { LISTING_PAYMENT_PLANS, MAX_BALANCE_DAYS, MAX_DEPOSIT_PERCENT, MIN_BALANCE_DAYS, MIN_DEPOSIT_PERCENT } from 'src/modules/payments/payment-schedule';
import { ListingStatus } from 'prisma/generated/client';
import { Transform, Type } from 'class-transformer';
import { SERVICE_AT, type ServiceAt } from 'src/modules/booking/booking-tracker';
import { MAX_BASE_FEE, MAX_FREE_MILES, MAX_PER_MILE } from 'src/modules/booking/travel-fee';
import { MAX_DOS, MAX_DO_LENGTH, MAX_INCLUDED_ITEMS, MAX_INCLUDED_ITEM_LENGTH, MAX_MIN_NOTICE_HOURS, readFlag, readIncludedItems, readNoticeHours } from '../package-details';

/** "true" / "false" from a multipart form (implicit conversion would read "false" as true). */
const readBoolean = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const v = obj[key];
  return v === 'true' || v === true ? true : v === 'false' || v === false ? false : v;
};

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

  @ApiPropertyOptional({ description: 'At the customer’s place, but the customer may choose to come to the vendor instead (pickup, drop-off)' })
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  customer_can_come?: boolean;

  @ApiPropertyOptional({ description: 'Whether customers must give a guest count to book (empty = the default: venues only)' })
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  guest_count_required?: boolean | null;

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

  @ApiPropertyOptional({ enum: LISTING_PAYMENT_PLANS, description: 'How customers pay; defaults to the category setting, else full payment on accept' })
  @IsOptional()
  // a custom plan is agreed per booking, never set on a package (a package's own deposit is DEPOSIT_CUSTOM)
  @IsIn(LISTING_PAYMENT_PLANS)
  payment_plan?: PaymentPlan;

  @ApiPropertyOptional({ minimum: MIN_DEPOSIT_PERCENT, maximum: MAX_DEPOSIT_PERCENT, description: 'DEPOSIT_CUSTOM: the deposit taken when the vendor accepts, in percent' })
  @IsOptional()
  // an empty field (a form sending every field) counts as not given
  @Transform(({ obj, key }) => (obj[key] === '' || obj[key] == null ? undefined : Number(obj[key])))
  @IsInt({ message: 'The deposit must be a whole percentage.' })
  @Min(MIN_DEPOSIT_PERCENT, { message: `The deposit must be at least ${MIN_DEPOSIT_PERCENT}%.` })
  @Max(MAX_DEPOSIT_PERCENT, { message: `The deposit can be at most ${MAX_DEPOSIT_PERCENT}%.` })
  deposit_percent?: number;

  @ApiPropertyOptional({ minimum: MIN_BALANCE_DAYS, maximum: MAX_BALANCE_DAYS, description: 'DEPOSIT_CUSTOM: days before the event the balance is due (unless it is after the service)' })
  @IsOptional()
  // an empty field (a form sending every field) counts as not given
  @Transform(({ obj, key }) => (obj[key] === '' || obj[key] == null ? undefined : Number(obj[key])))
  @IsInt({ message: 'The balance must be due a whole number of days before the event.' })
  @Min(MIN_BALANCE_DAYS, { message: `The balance must be due at least ${MIN_BALANCE_DAYS} day before the event.` })
  @Max(MAX_BALANCE_DAYS, { message: `The balance can be due at most ${MAX_BALANCE_DAYS} days before the event.` })
  balance_due_days?: number;

  @ApiPropertyOptional({ description: 'DEPOSIT_CUSTOM: the balance is charged after the service, once the customer confirms the work' })
  @IsOptional()
  @Transform(({ obj, key }) => readFlag(obj[key]))
  @IsBoolean()
  balance_after_service?: boolean;

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

  @ApiPropertyOptional({ description: 'Charge a delivery / travel fee by distance (only when the vendor goes to the customer; booking/travel-fee.ts)' })
  @IsOptional()
  @Transform(readBoolean)
  @IsBoolean()
  travel_fee_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Travel fee: miles that are free (0 or empty = none)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Free miles must be a whole number.' })
  @Min(0)
  @Max(MAX_FREE_MILES, { message: `Free miles can be up to ${MAX_FREE_MILES}.` })
  travel_free_miles?: number;

  @ApiPropertyOptional({ description: 'Travel fee: price per mile after the free miles' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PER_MILE, { message: `The price per mile can be up to $${MAX_PER_MILE}.` })
  travel_per_mile?: number;

  @ApiPropertyOptional({ description: 'Travel fee: a flat amount added to every booking it applies to (optional)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_BASE_FEE, { message: `The base travel fee can be up to $${MAX_BASE_FEE}.` })
  travel_base_fee?: number;

  @ApiPropertyOptional({ description: 'Travel fee: count the miles there and back (round trip) instead of one way' })
  @IsOptional()
  @Transform(readBoolean)
  @IsBoolean()
  travel_round_trip?: boolean;

  @ApiPropertyOptional({ description: 'How many hours ahead the package must be booked (0 or empty = no minimum)' })
  @IsOptional()
  @Transform(({ obj, key }) => readNoticeHours(obj[key]))
  @IsInt()
  @Min(0)
  @Max(MAX_MIN_NOTICE_HOURS, { message: 'Minimum notice can be up to 90 days.' })
  min_notice_hours?: number | null;
}
