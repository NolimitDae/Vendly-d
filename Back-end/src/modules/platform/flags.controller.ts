import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PlatformSettingsService } from './platform-settings.service';
import { PromoService } from './promo.service';

class PromoCheckDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsNumber()
  @Min(0)
  price: number;
}

@ApiTags('Platform')
@Controller()
export class FlagsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly promos: PromoService,
  ) {}

  /** Keys of enabled feature flags (public: apps read this on start). */
  @Get('flags')
  flags() {
    return this.settings.enabledFlags();
  }

  /** Checks a promo code against a price without using it up (same answer as sending the booking). */
  @Post('promo/check')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async check(@GetUser('userId') userId: string, @Body() dto: PromoCheckDto) {
    return { success: true, data: await this.promos.quote(dto.code, dto.price, userId) };
  }
}
