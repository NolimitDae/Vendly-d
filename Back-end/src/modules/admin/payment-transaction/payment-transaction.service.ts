import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRepository } from '../../../common/repository/user/user.repository';
import { UserType } from 'prisma/generated/client';

@Injectable()
export class PaymentTransactionService {
  constructor(
    private prisma: PrismaService,
    private userRepository: UserRepository,
  ) {}

  async findAll(user_id?: string) {
    try {
      const userDetails = await this.userRepository.getUserDetails(user_id);

      const whereClause = {};
      if (userDetails.type == UserType.EDITOR) {
        whereClause['user_id'] = user_id;
      }

      const paymentTransactions = await this.prisma.paymentTransaction.findMany(
        {
          where: {
            ...whereClause,
          },
          select: {
            id: true,
            reference_number: true,
            status: true,
            provider: true,
            amount: true,
            currency: true,
            paid_amount: true,
            paid_currency: true,
            created_at: true,
            updated_at: true,
          },
        },
      );

      return {
        success: true,
        data: paymentTransactions,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async findOne(id: string, user_id?: string) {
    try {
      const userDetails = await this.userRepository.getUserDetails(user_id);

      const whereClause = {};
      if (userDetails.type == UserType.EDITOR) {
        whereClause['user_id'] = user_id;
      }

      const paymentTransaction =
        await this.prisma.paymentTransaction.findUnique({
          where: {
            id: id,
            ...whereClause,
          },
          select: {
            id: true,
            reference_number: true,
            status: true,
            provider: true,
            amount: true,
            currency: true,
            paid_amount: true,
            paid_currency: true,
            created_at: true,
            updated_at: true,
          },
        });

      if (!paymentTransaction) {
        return {
          success: false,
          message: 'Payment transaction not found',
        };
      }

      return {
        success: true,
        data: paymentTransaction,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async getRevenueByMonth(year?: number) {
    const targetYear = year ?? new Date().getFullYear();
    const start = new Date(targetYear, 0, 1);
    const end = new Date(targetYear + 1, 0, 1);

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'paid',
        created_at: { gte: start, lt: end },
        deleted_at: null,
      },
      select: { created_at: true, amount: true },
    });

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const totals = Array(12).fill(0);
    for (const tx of transactions) {
      totals[tx.created_at.getMonth()] += Number(tx.amount ?? 0);
    }

    return {
      success: true,
      data: months.map((name, i) => ({ name, amount: Math.round(totals[i]) })),
    };
  }

  async remove(id: string, user_id?: string) {
    try {
      const userDetails = await this.userRepository.getUserDetails(user_id);

      const whereClause = {};
      if (userDetails.type == UserType.EDITOR) {
        whereClause['user_id'] = user_id;
      }

      const paymentTransaction =
        await this.prisma.paymentTransaction.findUnique({
          where: {
            id: id,
            ...whereClause,
          },
        });

      if (!paymentTransaction) {
        return {
          success: false,
          message: 'Payment transaction not found',
        };
      }

      await this.prisma.paymentTransaction.delete({
        where: {
          id: id,
        },
      });

      return {
        success: true,
        message: 'Payment transaction deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
