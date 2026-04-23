import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { UserType } from 'prisma/generated/enums';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'Tanvir Ahamed',
    description: 'Full name of the user (auto-generated from first + last name)',
  })
  name?: string;

  @IsNotEmpty({ message: 'First name is required' })
  @IsString()
  @ApiProperty({
    example: 'Tanvir',
    description: 'First name of the user',
    required: true,
  })
  first_name: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString()
  @ApiProperty({
    example: 'Ahamed',
    description: 'Last name of the user',
    required: true,
  })
  last_name: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: '123 Main St, Dhaka, Bangladesh',
    description: 'Residential or business address of the user',
  })
  address?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: '+8801923982877',
    description: 'Phone number of the user (international format preferred)',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'My Business Ltd.',
    description: 'Business name (required for vendors and event planners)',
  })
  business_name?: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ApiProperty({
    example: 'john@example.com',
    description: 'Unique email address of the user',
    required: true,
    format: 'email',
  })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @ApiProperty({
    example: 'P@ssw0rd123',
    description: 'Account password — minimum 8 characters',
    required: true,
    minLength: 8,
    format: 'password',
  })
  password: string;

  @IsOptional()
  @IsEnum(UserType, {
    message: `User type must be one of: ${Object.values(UserType).join(', ')}`,
  })
  @ApiProperty({
    enum: UserType,
    enumName: 'UserType',
    default: UserType.CLIENT,
    description: `Role/type of the user account. Available values: ${Object.values(UserType).join(' | ')}`,
    example: UserType.CLIENT,
    required: false,
  })
  type?: UserType;

  @IsOptional()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile image of the user (JPEG, PNG — max 5MB)',
  })
  image?: any;
}