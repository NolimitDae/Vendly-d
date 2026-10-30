import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserType } from 'prisma/generated/client';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PromoService, type PromoInput } from './promo.service';

/** Only an account that sells (its current role, or one of its roles) makes promo codes. */
function vendorId(user: { userId: string; type?: string; roles?: string[] }) {
  if (user.type !== UserType.VENDOR && !(user.roles ?? []).includes(UserType.VENDOR)) throw new ForbiddenException('Only vendors make promo codes.');
  return user.userId;
}

/** A vendor's own promo codes, for their packages only (platform/promo.service.ts). */
@ApiTags('vendor/promos')
@ApiBearerAuth('vendor-token')
@UseGuards(JwtAuthGuard)
@Controller('vendor/promos')
export class VendorPromosController {
  constructor(private readonly promos: PromoService) {}

  @Get()
  list(@GetUser() user: any) {
    return this.promos.listForVendor(vendorId(user));
  }

  @Post()
  create(@GetUser() user: any, @Body() body: PromoInput) {
    return this.promos.createForVendor(vendorId(user), body);
  }

  @Patch(':id')
  update(@GetUser() user: any, @Param('id') id: string, @Body() body: Partial<PromoInput>) {
    return this.promos.updateForVendor(vendorId(user), id, body);
  }

  /** Turns the code off (bookings that used it keep it). */
  @Delete(':id')
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.promos.removeForVendor(vendorId(user), id);
  }
}
