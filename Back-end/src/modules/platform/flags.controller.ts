import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PlatformSettingsService } from './platform-settings.service';
import { PromoService } from './promo.service';
import { PrismaService } from 'src/prisma/prisma.service';

class PromoCheckDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsNumber()
  @Min(0)
  price: number;

  /** the package it's for: a vendor's own code only works on their packages */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  listing_id?: string;
}

@ApiTags('Platform')
@Controller()
export class FlagsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly promos: PromoService,
    private readonly prisma: PrismaService,
  ) {}

  /** Keys of enabled feature flags (public: apps read this on start). */
  @Get('flags')
  flags() {
    return this.settings.enabledFlags();
  }

  /** The fee (percent, minimum, cap) and the large booking rules, for the apps' wording (public). */
  @Get('payment-settings')
  paymentSettings() {
    return this.settings.paymentSettings();
  }

  /** Checks a promo code against a price without using it up (same answer as sending the booking). */
  @Post('promo/check')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async check(@GetUser('userId') userId: string, @Body() dto: PromoCheckDto) {
    const listing = dto.listing_id ? await this.prisma.vendorListing.findFirst({ where: { id: dto.listing_id, deleted_at: null }, select: { id: true, vendor_id: true } }) : null;
    const scope = listing ? { vendorId: listing.vendor_id, listingId: listing.id } : undefined;
    return { success: true, data: await this.promos.quote(dto.code, dto.price, userId, new Date(), scope) };
  }
}
