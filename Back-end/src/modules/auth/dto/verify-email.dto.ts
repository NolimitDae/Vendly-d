import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address to verify',
    required: true,
    format: 'email',
  })
  email: string;

  @IsNotEmpty({ message: 'OTP token is required' })
  @IsString()
  @Length(6, 6, { message: 'OTP token must be exactly 6 characters' })
  @ApiProperty({
    example: '123456',
    description: 'OTP verification token sent to your email',
    required: true,
    minLength: 6,
    maxLength: 6,
  })
  token: string;
}
