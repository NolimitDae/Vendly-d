import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'Tanvir Ahamed',
    description: 'Full name of the user',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'Tanvir',
    description: 'First name of the user',
  })
  first_name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'Ahamed',
    description: 'Last name of the user',
  })
  last_name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: '123 Main St, Dhaka, Bangladesh',
    description: 'Residential or business address of the user',
  })
  address?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'A little about my business…' })
  about_me?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'bellas-catering', description: 'Vendor shop link: vendlymarketplace.com/v/<handle>. Empty clears it.' })
  handle?: string;

  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Vendors: weekly working hours. An object (or a JSON string in multipart) with all 7 days mon..sun, each { open: "09:00", close: "17:00" } or null when closed. null clears the hours (bookable any time).',
    example: { mon: { open: '09:00', close: '17:00' }, tue: { open: '09:00', close: '17:00' }, wed: { open: '09:00', close: '17:00' }, thu: { open: '09:00', close: '17:00' }, fri: { open: '09:00', close: '17:00' }, sat: { open: '10:00', close: '14:00' }, sun: null },
  })
  working_hours?: unknown;

  @IsOptional()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'New profile image (JPEG, PNG — max 5MB)',
  })
  image?: any;

  @IsOptional()
  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Vendor shop banner (max 5MB)' })
  banner?: any;

  @IsOptional()
  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Vendor shop logo (max 5MB)' })
  logo?: any;
}

