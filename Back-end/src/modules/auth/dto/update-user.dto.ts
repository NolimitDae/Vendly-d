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
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'New profile image (JPEG, PNG — max 5MB)',
  })
  image?: any;
}

