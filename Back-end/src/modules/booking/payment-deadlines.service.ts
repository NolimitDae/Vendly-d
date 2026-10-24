import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { withJobLock } from 'src/common/helper/job-lock';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { PAYMENT_DUE_REMINDER_HOURS, PaymentDueKind } from 'src/modules/payments/payment-due';
import { BookingService } from './booking.service';

const HOUR = 3600 * 1000;
const BATCH = 100;

/**
 * Deposit plans' 12-hour rule (payments/payment-due.ts): reminds customers with about 2 hours left to
 * pay a missed deposit or balance, and cancels bookings still unpaid at their deadline (settled like a
 * customer cancellation, reason "non_payment" by "system"). Runs every 10 minutes on one server at a
 * time; each step is claimed on the booking row, so a rerun never repeats one.
 */
@Injectable()
export class PaymentDeadlinesService {
  private readonly logger = new Logger(PaymentDeadlinesService.name);

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private bookings: BookingService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  cron() {
    return withJobLock(this.prisma, 'payment-deadlines', () => this.run());
  }

  async run(now = new Date()) {
    const reminded = await this.remind(now).catch((err) => {
      this.logger.error(`Payment due reminders failed: ${(err as Error).message}`);
      return 0;
    });
    const cancelled = await this.cancelOverdue(now);
    return { reminded, cancelled };
  }

  /** Once per missed payment, when about 2 hours are left. */
  async remind(now = new Date()) {
    const due = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        deleted_at: null,
        payment_due_reminded_at: null,
        payment_due_by: { gt: now, lte: new Date(now.getTime() + PAYMENT_DUE_REMINDER_HOURS * HOUR) },
      },
      select: {
        id: true, customer_id: true, payment_due_by: true, payment_due_kind: true,
        listing: { select: { title: true } }, customer: { select: { email: true, name: true } },
        installments: { where: { kind: 'charge', status: { in: ['FAILED', 'SCHEDULED'] } }, select: { sequence: true, amount: true } },
      },
      take: BATCH,
    });
    let sent = 0;
    for (const b of due) {
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, payment_due_reminded_at: null, payment_due_by: b.payment_due_by }, data: { payment_due_reminded_at: now } });
      if (!claimed.count) continue;
      const kind = (b.payment_due_kind === 'balance' ? 'balance' : 'deposit') as PaymentDueKind;
      const inst = b.installments.find((i) => i.sequence === (kind === 'deposit' ? 1 : 2));
      await this.payments.notifyPaymentDue(b, { kind, amount: Number(inst?.amount ?? 0), dueBy: b.payment_due_by!, reminder: true });
      sent++;
    }
    return sent;
  }

  /** Bookings whose deposit or balance still isn't paid at the deadline are cancelled for non-payment. */
  async cancelOverdue(now = new Date()) {
    const overdue = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        deleted_at: null,
        payment_due_by: { lte: now },
        // left out, not skipped in the loop, so they can't fill every batch: Vendly settles a disputed
        // booking itself, and a charge still going through at Stripe settles first (even one stuck there)
        OR: [{ dispute_opened_at: null }, { dispute_resolved_at: { not: null } }],
        installments: { none: { kind: 'charge', status: 'PROCESSING' } },
      },
      select: { id: true, payment_due_kind: true, installments: { where: { kind: 'charge' }, select: { sequence: true, status: true } } },
      orderBy: { payment_due_by: 'asc' },
      take: BATCH,
    });
    let cancelled = 0;
    for (const b of overdue) {
      const inst = b.installments.find((i) => i.sequence === (b.payment_due_kind === 'balance' ? 2 : 1));
      // paid in the meantime (the webhook clears it too) or no longer there: nothing is waiting
      if (!inst || inst.status === 'PAID' || inst.status === 'REFUNDED' || inst.status === 'CANCELLED') {
        await this.prisma.booking.updateMany({ where: { id: b.id, payment_due_by: { lte: now } }, data: { payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null } });
        continue;
      }
      // a charge still going through at Stripe: look again next run
      if (inst.status === 'PROCESSING') continue;
      try {
        if (await this.bookings.cancelForNonPayment(b.id, now)) cancelled++;
      } catch (err) {
        // already cancelled by someone else, or an open dispute: nothing to do
        this.logger.warn(`Non-payment cancellation of ${b.id} skipped: ${(err as Error).message}`);
        Sentry.captureException(err, { level: 'warning', tags: { job: 'payment-deadlines' }, extra: { booking_id: b.id } });
      }
    }
    return cancelled;
  }
}
