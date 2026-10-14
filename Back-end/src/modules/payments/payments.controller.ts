import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Client secret for Stripe's card form; the saved card is charged when vendors accept. */
  @Post('setup-intent')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  setupIntent(@GetUser() user: any) {
    return this.payments.createSetupIntent(user.id);
  }

  @Get('methods')
  methods(@GetUser() user: any) {
    return this.payments.listCards(user.id);
  }

  @Patch('methods/:id/default')
  setDefault(@GetUser() user: any, @Param('id') id: string) {
    return this.payments.setDefaultCard(user.id, id);
  }

  @Delete('methods/:id')
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.payments.removeCard(user.id, id);
  }
}
