import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { webSession } from '../auth-cookies';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SocialAuthService, type SocialRole } from './social-auth.service';

export class SocialSignInDto {
  @ApiProperty({ enum: ['google', 'apple'] }) @IsIn(['google', 'apple']) provider: 'google' | 'apple';
  @ApiProperty({ description: 'ID token from the Google or Apple sign-in sheet' }) @IsString() @MaxLength(5000) id_token: string;
  @ApiPropertyOptional({ enum: ['CLIENT', 'VENDOR', 'EVENT_PLANNER'], description: 'Needed only when this creates a new account' })
  @IsOptional()
  @IsIn(['CLIENT', 'VENDOR', 'EVENT_PLANNER'])
  role?: SocialRole;
  @ApiPropertyOptional({ description: 'Required when this creates a new account: they accepted the Terms of Service and Privacy Policy' })
  @IsOptional()
  @IsBoolean()
  accepted_terms?: boolean;
  @ApiPropertyOptional({ description: 'Apple only shares the name on the first sign-in, so the app passes it along' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ description: 'The 6-digit authenticator code, for accounts with two-step sign-in (after a "Token is required" answer)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  token?: string;
}

@ApiTags('auth')
@Controller('auth')
export class SocialAuthController {
  constructor(private readonly social: SocialAuthService) {}

  @ApiOperation({ summary: 'Sign in or sign up with Google or Apple (native apps)', description: 'Returns the same authorization payload as /auth/login, or { needs_role: true } for a brand-new account without a role. Accounts with two-step sign-in get 401 "Token is required" until the call includes `token`.' })
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('social')
  async signIn(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: SocialSignInDto) {
    // the website (if it signs in this way) gets HttpOnly cookies; the apps get tokens as before
    return webSession(req, res, await this.social.signIn(dto));
  }
}
