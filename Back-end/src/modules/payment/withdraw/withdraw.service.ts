import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateWithdrawDto, WithdrawResponse } from './dto/create-withdraw.dto';
import { UpdateWithdrawDto } from './dto/update-withdraw.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import { withJobLock } from 'src/common/helper/job-lock';
import { PushService } from 'src/modules/push/push.service';
import { TEST_ACCOUNT_NO_PAYOUTS } from 'src/common/helper/test-accounts';
import * as Sentry from '@sentry/nestjs';
import { isStripeMissing } from 'src/common/lib/Payment/stripe/stripe-errors';

/** Smallest withdrawal in dollars (the website says the same). */
export const MIN_WITHDRAW = 20;

/** A withdrawal Stripe didn't confirm is looked up once it is this old (a request still in flight has finished by then). */
const REVIEW_AFTER_MS = 60 * 60 * 1000;

/** How a withdrawal left "needs_review" is settled: the transfer went out, or the money goes back to the balance. */
export type WithdrawalOutcome = 'completed' | 'returned';

/** True when Stripe answered and turned the transfer down, so nothing was sent; false when the outcome is unknown. */
const stripeRefused = (err: any) => {
  const code = Number(err?.statusCode ?? err?.raw?.statusCode ?? 0);
  // 409: the same key is still being processed by Stripe, so the outcome is not known yet
  return code >= 400 && code < 500 && code !== 409;
};

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // Stripe Connected Account
  async createConnectedAccount(
    userId: string,
    email: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: { accountId: string };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    // test vendors never get a real payout account
    if (user.is_test) throw new BadRequestException(TEST_ACCOUNT_NO_PAYOUTS);

    if (user.stripe_connect_id) {
      throw new BadRequestException('You already have a payout account');
    }

    try {
      // Create Stripe Connected Account
      const connectedAccount = await StripePayment.createConnectedAccount(email);

      // Save banking_id in user's profile
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          stripe_connect_id: connectedAccount.id,
        },
      });

      return {
         success: true,
         message: 'Connected account created successfully',
         data: {
          accountId: connectedAccount.id
         }
        };
    } catch (error) {
      console.error('Connected account error:', error);
      throw new HttpException(
        'Failed to create payout account. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Stripe Connect Onboarding Link
  async createOnboardingLink(accountId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    data: { url: string };
  }> {
    // An onboarding link can change where payouts go, so only the account's owner may get one.
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { stripe_connect_id: true, is_test: true } });
    if (owner?.is_test) throw new BadRequestException(TEST_ACCOUNT_NO_PAYOUTS);
    if (!owner?.stripe_connect_id || owner.stripe_connect_id !== accountId) {
      throw new NotFoundException('Payout account not found');
    }
    try {
      const accountLink = await StripePayment.createOnboardingAccountLink(accountId);
      return {
        success: true,
        message: 'Onboarding link created successfully',
        data: {
          url: accountLink.url 
        }
      };
    } catch (error) { 
      console.error('Onboarding link error:', error);
      throw new HttpException(
        'Failed to create onboarding link',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  //Withdraw Request
  async processWithdraw(
    userId: string,
    withdrawDto: CreateWithdrawDto,
  ) :
  Promise<WithdrawResponse> {

    // the balance is in US dollars, so the transfer is too, whatever the request says
    const currency = 'usd';
    // whole cents: what is taken off the balance is exactly what is sent
    const amount = Math.round(Number(withdrawDto.amount) * 100) / 100;

    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.is_test) throw new BadRequestException(TEST_ACCOUNT_NO_PAYOUTS);

    // Check if user has a connected account
    if (!user.stripe_connect_id) {
      throw new BadRequestException('Please set up a payout account first');
    }
    const accountId = user.stripe_connect_id;

    // Check if user has available balance
    if (!user.balance || Number(user.balance) <= 0) {
      throw new BadRequestException('Insufficient balance to withdraw');
    }

    // Check minimum withdraw amount (the website asks for the same)
    if (!(amount >= MIN_WITHDRAW)) {
      throw new BadRequestException(`Minimum withdraw amount is $${MIN_WITHDRAW}`);
    }

    // Check if withdraw amount exceeds available balance
    if (amount > Number(user.balance)) {
      throw new BadRequestException(
        'Withdraw amount exceeds available balance',
      );
    }

    // Take the money off the balance first, and only if it is still there, so two requests at once
    // can't both send it. The pending row's id keys the transfer: a repeated call never sends twice.
    const pending = await this.prisma.$transaction(async (tx) => {
      const taken = await tx.user.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (taken.count !== 1) return null;
      return tx.paymentTransaction.create({
        data: {
          user_id: userId,
          type: 'withdraw',
          withdraw_via: 'stripe',
          provider: 'stripe',
          status: 'pending',
          amount: amount,
          currency: currency,
        },
      });
    });
    if (!pending) {
      throw new BadRequestException(
        'Withdraw amount exceeds available balance',
      );
    }

    const send = () => StripePayment.createTransfer(accountId, amount, currency, `withdraw-${pending.id}`, pending.id);
    let transfer: Awaited<ReturnType<typeof send>>;
    try {
      try {
        transfer = await send();
      } catch (error) {
        // no answer from Stripe: the same key either finds the transfer already made or makes it once
        if (stripeRefused(error)) throw error;
        transfer = await send();
      }
    } catch (error) {
      console.error('Withdraw processing error:', error);
      if (!stripeRefused(error)) {
        // still unknown whether the money left: it stays off the balance until Vendly has checked
        await this.prisma.paymentTransaction.update({ where: { id: pending.id }, data: { status: 'needs_review' } });
        Sentry.captureException(error, { tags: { job: 'withdraw' }, extra: { transaction_id: pending.id, user_id: userId, amount } });
        throw new HttpException(
          'We could not confirm this withdrawal with the bank yet. Vendly is checking it and will put the money back in your balance if it did not go through.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      // Stripe turned it down: the money goes back into the balance
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { balance: { increment: amount } } }),
        this.prisma.paymentTransaction.update({ where: { id: pending.id }, data: { status: 'failed' } }),
      ]);

      let errorMessage = 'Failed to process withdraw. Please try again later.';
      if ((error as any)?.code === 'balance_insufficient') {
        errorMessage =
          'Stripe account have not enough balance. Please try again later.';
      }
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Save transaction record
    await this.prisma.paymentTransaction.update({
      where: { id: pending.id },
      data: {
        reference_number: transfer.id,
        status: 'completed',
        paid_amount: amount,
        paid_currency: currency,
      },
    });

    return {
      success: true,
      message: 'Withdraw processed successfully',
      data: {
        transfer_id: transfer.id,
        amount: amount,
        currency: currency,
        status: 'completed',
      },
    };
  }

  // ─── Withdrawals Stripe didn't confirm ("needs_review") ──────────────────

  /** Hourly: looks each one up in Stripe and settles it, or leaves it for an admin when that's not clear. */
  @Cron(CronExpression.EVERY_HOUR)
  cronReviewWithdrawals() {
    return withJobLock(this.prisma, 'withdraw-review', () => this.reviewWithdrawals());
  }

  async reviewWithdrawals(now = new Date()) {
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { type: 'withdraw', status: 'needs_review', created_at: { lte: new Date(now.getTime() - REVIEW_AFTER_MS) } },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
    const settled: { id: string; outcome: WithdrawalOutcome }[] = [];
    for (const row of rows) {
      try {
        const found = await this.findTransfer(row);
        // more than one transfer could be it: an admin decides
        if (found === 'unclear') continue;
        const outcome: WithdrawalOutcome = found ? 'completed' : 'returned';
        if (await this.settleWithdrawal(row.id, outcome, found?.id)) settled.push({ id: row.id, outcome });
      } catch (e) {
        // Stripe didn't answer: try again next hour
        this.logger.error(`withdrawal review ${row.id}`, e);
        Sentry.captureException(e, { tags: { job: 'withdraw-review' }, extra: { transaction_id: row.id } });
      }
    }
    return settled;
  }

  /**
   * The Stripe transfer behind a withdrawal: found by its group (withdrawals made since the group was
   * added), else, for older ones, the only plain transfer of that amount to the vendor's account made
   * within an hour of the request. Null when there is none (nothing was sent).
   */
  private async findTransfer(row: { id: string; user_id: string | null; amount: unknown; created_at: Date }): Promise<{ id: string } | null | 'unclear'> {
    const grouped = await StripePayment.listTransfers({ transferGroup: `withdraw_${row.id}` });
    if (grouped.length) return { id: grouped[0].id };
    const user = row.user_id ? await this.prisma.user.findUnique({ where: { id: row.user_id }, select: { stripe_connect_id: true } }) : null;
    if (!user?.stripe_connect_id) return null;
    const at = Math.floor(row.created_at.getTime() / 1000);
    const cents = Math.round(Number(row.amount) * 100);
    const candidates = (await StripePayment.listTransfers({ destination: user.stripe_connect_id, createdFrom: at - 300, createdTo: at + 3600 })).filter(
      // booking payouts carry a group and metadata; an older withdrawal's transfer has neither
      (t) => t.amount === cents && !t.transfer_group && !t.metadata?.booking_id && (!t.metadata?.withdrawal_id || t.metadata.withdrawal_id === row.id),
    );
    if (!candidates.length) return null;
    // a transfer already recorded on another withdrawal isn't this one
    const taken = await this.prisma.paymentTransaction.findMany({ where: { type: 'withdraw', reference_number: { in: candidates.map((t) => t.id) }, id: { not: row.id } }, select: { reference_number: true } });
    const free = candidates.filter((t) => !taken.some((r) => r.reference_number === t.id));
    if (free.length === 1) return { id: free[0].id };
    return free.length ? 'unclear' : null;
  }

  /**
   * Settles a "needs_review" withdrawal once: completed (the transfer went out), or returned (the
   * money goes back into the balance and the withdrawal is marked failed). The status claim means
   * the hourly check and an admin can never both act on it. True when this call settled it.
   */
  async settleWithdrawal(id: string, outcome: WithdrawalOutcome, transferId?: string) {
    const row = await this.prisma.paymentTransaction.findUnique({ where: { id } });
    if (!row || row.type !== 'withdraw') throw new NotFoundException('Withdrawal not found');
    const amount = Math.round(Number(row.amount) * 100) / 100;
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentTransaction.updateMany({
        where: { id, type: 'withdraw', status: 'needs_review' },
        data:
          outcome === 'completed'
            ? { status: 'completed', paid_amount: amount, paid_currency: row.currency, ...(transferId && { reference_number: transferId }) }
            : { status: 'failed' },
      });
      if (claimed.count !== 1) return false;
      if (outcome === 'returned' && row.user_id) await tx.user.update({ where: { id: row.user_id }, data: { balance: { increment: amount } } });
      return true;
    });
    if (done && row.user_id) {
      void this.push
        .sendToUser(row.user_id, {
          title: outcome === 'completed' ? 'Withdrawal sent' : 'Withdrawal returned to your balance',
          body:
            outcome === 'completed'
              ? `Your withdrawal of $${amount.toFixed(2)} went through to your payout account.`
              : `Your withdrawal of $${amount.toFixed(2)} didn’t go through, so the money is back in your Vendly balance. You can withdraw it again.`,
          data: { type: 'payout' },
        }, 'payments')
        .catch(() => null);
    }
    return done;
  }

  /** Admin: withdrawals waiting for a check, oldest first. */
  async listNeedsReview() {
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { type: 'withdraw', status: 'needs_review' },
      orderBy: { created_at: 'asc' },
      take: 200,
      select: { id: true, amount: true, currency: true, created_at: true, user: { select: { id: true, name: true, email: true, stripe_connect_id: true } } },
    });
    return { success: true, data: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
  }

  /** Admin: settle one by hand after checking Stripe. */
  async adminSettle(id: string, outcome: WithdrawalOutcome, transferId?: string) {
    const done = await this.settleWithdrawal(id, outcome, transferId?.trim() || undefined);
    if (!done) throw new BadRequestException('This withdrawal was already settled.');
    return { success: true, data: { id, outcome } };
  }

  //Check Connected Account Balance
  async checkAccountBalance(userId: string) {
   
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripe_connect_id: true },
    });

    if (!user || !user.stripe_connect_id) {
      throw new BadRequestException('No connected account found');
    }

    try {
      const balance = await StripePayment.checkBalance(user.stripe_connect_id);

      const availableAmount = balance.available?.[0]?.amount || 0;
      const pendingAmount = balance.pending?.[0]?.amount || 0;
      const currency = balance.available?.[0]?.currency || 'usd';

      return {
        success: true,
        data: {
          available: {
            amount: availableAmount / 100,
            amount_in_cents: availableAmount,
            currency: currency,
            display: `$${(availableAmount / 100).toFixed(2)} ${currency.toUpperCase()}`,
          },
          pending: {
            amount: pendingAmount / 100,
            amount_in_cents: pendingAmount,
            currency: currency,
            display: `$${(pendingAmount / 100).toFixed(2)} ${currency.toUpperCase()}`,
          },
          total: {
            amount: (availableAmount + pendingAmount) / 100,
            display: `$${((availableAmount + pendingAmount) / 100).toFixed(2)} ${currency.toUpperCase()}`,
          },
        },
      };
    } catch (error) {
      console.error('Error checking balance:', error);
      throw new HttpException(
        'Failed to check balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  //Withdraw History
  async getWithdrawHistory(userId: string) {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        user_id: userId,
        type: 'withdraw',
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return {
      success: true,
      data: transactions,
    };
  }

  //Get Connected Account Info
  async getConnectedAccountInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        stripe_connect_id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Whether Stripe's setup is finished, so the apps don't treat a half-done account as ready.
    // Left out when Stripe can't be reached; the apps then fall back to "has an account".
    let status: { payouts_enabled?: boolean; details_submitted?: boolean; charges_enabled?: boolean } = {};
    if (user.stripe_connect_id) {
      try {
        const account = await StripePayment.retrieveAccount(user.stripe_connect_id);
        status = {
          payouts_enabled: !!account.payouts_enabled,
          details_submitted: !!account.details_submitted,
          charges_enabled: !!account.charges_enabled,
        };
      } catch (error) {
        if (isStripeMissing(error)) {
          // the payout account is gone (deleted in Stripe, or made with other Stripe keys): forget it so
          // the vendor can set payouts up again
          await this.prisma.user.updateMany({ where: { id: userId, stripe_connect_id: user.stripe_connect_id }, data: { stripe_connect_id: null } });
          user.stripe_connect_id = null;
        } else {
          console.error('Connected account lookup error:', error);
        }
      }
    }

    return {
      success: true,
      message: 'Connected account info retrieved successfully',
      data: {
        hasConnectedAccount: !!user.stripe_connect_id,
        accountId: user.stripe_connect_id,
        email: user.email,
        name: user.name,
        ...status,
      },
    };
  }
}
