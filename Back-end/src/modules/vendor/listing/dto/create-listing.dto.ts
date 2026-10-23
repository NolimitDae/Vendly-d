import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
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
import { Type } from 'class-transformer';

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
}
