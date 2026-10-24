import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CreateWithdrawDto, WithdrawResponse } from './dto/create-withdraw.dto';
import { UpdateWithdrawDto } from './dto/update-withdraw.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripePayment } from 'src/common/lib/Payment/stripe/StripePayment';
import * as Sentry from '@sentry/nestjs';

/** Smallest withdrawal in dollars (the website says the same). */
export const MIN_WITHDRAW = 20;

/** True when Stripe answered and turned the transfer down, so nothing was sent; false when the outcome is unknown. */
const stripeRefused = (err: any) => {
  const code = Number(err?.statusCode ?? err?.raw?.statusCode ?? 0);
  // 409: the same key is still being processed by Stripe, so the outcome is not known yet
  return code >= 400 && code < 500 && code !== 409;
};

@Injectable()
export class WithdrawService {
  constructor(private readonly prisma: PrismaService) {}

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
  async createOnboardingLink(accountId: string): Promise<{
    success: boolean;
    message: string;
    data: { url: string };
  }> {
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

    const { currency = 'usd' } = withdrawDto;
    // whole cents: what is taken off the balance is exactly what is sent
    const amount = Math.round(Number(withdrawDto.amount) * 100) / 100;

    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

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

    const send = () => StripePayment.createTransfer(accountId, amount, currency, `withdraw-${pending.id}`);
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

    return {
      success: true,
      message: 'Connected account info retrieved successfully',
      data: {
        hasConnectedAccount: !!user.stripe_connect_id,
        accountId: user.stripe_connect_id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
