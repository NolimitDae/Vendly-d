import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SocialAuthService, type SocialRole } from './social-auth.service';

export class SocialSignInDto {
  @ApiProperty({ enum: ['google', 'apple'] }) @IsIn(['google', 'apple']) provider: 'google' | 'apple';
  @ApiProperty({ description: 'ID token from the Google or Apple sign-in sheet' }) @IsString() @MaxLength(5000) id_token: string;
  @ApiPropertyOptional({ enum: ['CLIENT', 'VENDOR', 'EVENT_PLANNER'], description: 'Needed only when this creates a new account' })
  @IsOptional()
  @IsIn(['CLIENT', 'VENDOR', 'EVENT_PLANNER'])
  role?: SocialRole;
  @ApiPropertyOptional({ description: 'Apple only shares the name on the first sign-in, so the app passes it along' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

@ApiTags('auth')
@Controller('auth')
export class SocialAuthController {
  constructor(private readonly social: SocialAuthService) {}

  @ApiOperation({ summary: 'Sign in or sign up with Google or Apple (native apps)', description: 'Returns the same authorization payload as /auth/login, or { needs_role: true } for a brand-new account without a role.' })
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('social')
  signIn(@Body() dto: SocialSignInDto) {
    return this.social.signIn(dto);
  }
}
