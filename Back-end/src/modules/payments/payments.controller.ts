import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/modules/auth/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { TransactionsService, type TransactionsQuery } from './transactions.service';
import { IsIn, IsOptional } from 'class-validator';

class SetupIntentDto {
  // a card (the default), or a US bank account (large bookings)
  @IsOptional()
  @IsIn(['card', 'us_bank_account'])
  type?: 'card' | 'us_bank_account';
}

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly transactions: TransactionsService,
  ) {}

  /**
   * The signed-in user's money history: charges and refunds (customers); payments received, payouts,
   * commission, money given back, recoveries and withdrawals (vendors). Newest first.
   * ?type=all|payment|refund|payout|fee&from=YYYY-MM-DD&to=YYYY-MM-DD&q=<booking title>&page&limit&role=customer|vendor
   */
  @Get('transactions')
  list(@GetUser() user: any, @Query() query: TransactionsQuery) {
    return this.transactions.list({ id: user.id, type: user.type }, query);
  }

  /**
   * Client secret for Stripe's card form; the saved card is charged when vendors accept. With
   * { type: 'us_bank_account' }, for connecting a bank account instead (large bookings).
   */
  @Post('setup-intent')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  setupIntent(@GetUser() user: any, @Body() dto: SetupIntentDto) {
    return this.payments.createSetupIntent(user.id, dto?.type);
  }

  /** The signed-in vendor's earnings: released, held, Vendly commission and money given back. */
  @Get('earnings')
  earnings(@GetUser() user: any) {
    return this.payments.vendorEarningsSummary(user.id);
  }

  /** Saved cards; ?bank=1 adds saved bank accounts (newer apps, which can show them). */
  @Get('methods')
  methods(@GetUser() user: any, @Query('bank') bank?: string) {
    return this.payments.listCards(user.id, bank === '1' || bank === 'true');
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
