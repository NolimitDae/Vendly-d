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

    const { amount, currency = 'usd' } = withdrawDto;
   
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

    // Check if user has available balance
    if (!user.balance|| user.balance.toNumber() <= 0) {
      throw new BadRequestException('Insufficient balance to withdraw');
    }

    // Check minimum withdraw amount (minimum $20)
    if (amount < 2) {
      throw new BadRequestException('Minimum withdraw amount is $20');
    }

    // Check if withdraw amount exceeds available balance
    if (
      amount > user.balance.toNumber?.() ||
      amount > Number(user.balance)
    ) {
      throw new BadRequestException(
        'Withdraw amount exceeds available balance',
      );
    }

    try {
      // Create Stripe Transfer (from platform to connected account)
      const transfer = await StripePayment.createTransfer(
        user.stripe_connect_id,
        amount,
        currency,
      );

      // Update user's available balance
      await this.prisma.user.update({
        where: { id: userId },
        data: {
         balance: {
            decrement: amount,
          },
        },
      });

      // Save transaction record
      await this.prisma.paymentTransaction.create({
        data: {
          user_id: userId,
          type: 'withdraw',
          withdraw_via: 'stripe',
          provider: 'stripe',
          reference_number: transfer.id,
          status: 'completed',
          amount: amount,
          currency: currency,
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
    } catch (error) {
      
      console.error('Withdraw processing error:', error);
     
      await this.prisma.paymentTransaction.create({
        data: {
          user_id: userId,
          type: 'withdraw',
          withdraw_via: 'stripe',
          provider: 'stripe',
          status: 'failed',
          amount: amount,
          currency: currency,
        },
      });

      let errorMessage = 'Failed to process withdraw. Please try again later.';
      if (error?.code === 'balance_insufficient') {
        errorMessage =
          'Stripe account have not enough balance. Please try again later.';
      }
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
