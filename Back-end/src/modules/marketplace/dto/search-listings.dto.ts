import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class SearchListingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sub_category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max_price?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'newest', 'rating', 'distance'] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ example: '2026-11-14', description: 'Only packages not blocked by the vendor on this day' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ example: 29.76, description: 'Search near this point (with near_lng)' })
  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  near_lat?: number;

  @ApiPropertyOptional({ example: -95.37 })
  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  near_lng?: number;

  @ApiPropertyOptional({ example: 25, description: 'Radius in miles (default 25)' })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  radius_miles?: number;

  @ApiPropertyOptional({ example: 4, description: 'Minimum average review rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  min_rating?: number;
}
