import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { BookingStatus } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { withJobLock } from 'src/common/helper/job-lock';
import { PaymentsService } from 'src/modules/payments/payments.service';
import { dueInstallment, LARGE_PAYMENT_DUE_REMINDER_HOURS, paymentDueRules, PaymentDueKind } from 'src/modules/payments/payment-due';
import { isLargeBooking } from 'src/modules/platform/fee-config';
import { BookingService } from './booking.service';

const HOUR = 3600 * 1000;
const BATCH = 100;

/**
 * Deposit plans' 12-hour rule (payments/payment-due.ts; 48 hours on large bookings): reminds customers
 * with about 2 hours left (6 on large bookings) to pay a missed deposit or balance, and cancels bookings still unpaid at their deadline (settled like a
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

  /** Once per missed payment, when about 2 hours are left (6 on a large booking). */
  async remind(now = new Date()) {
    const due = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        deleted_at: null,
        payment_due_reminded_at: null,
        // the widest window; each booking's own is checked below
        payment_due_by: { gt: now, lte: new Date(now.getTime() + LARGE_PAYMENT_DUE_REMINDER_HOURS * HOUR) },
        // a charge going through at Stripe (a bank payment clearing) isn't missing: no "pay now or else"
        installments: { none: { kind: 'charge', status: 'PROCESSING' } },
      },
      select: {
        id: true, customer_id: true, payment_due_by: true, payment_due_kind: true, amount: true, service_fee: true, payment_plan: true,
        listing: { select: { title: true } }, customer: { select: { email: true, name: true } },
        // every charge, as cancelOverdue reads them: dueInstallment needs the whole list (a custom plan's first one is the deposit)
        installments: { where: { kind: 'charge' }, select: { sequence: true, amount: true, status: true, attempts: true } },
      },
      // soonest first: bookings skipped below (not in their own window yet) come last
      orderBy: { payment_due_by: 'asc' },
      take: BATCH,
    });
    let sent = 0;
    for (const b of due) {
      const { reminderHours } = paymentDueRules(isLargeBooking(b));
      if (b.payment_due_by!.getTime() > now.getTime() + reminderHours * HOUR) continue;
      const inst = dueInstallment(b, b.installments);
      // nothing waiting any more (paid meanwhile): no reminder; cancelOverdue clears the window
      if (!inst || !['FAILED', 'SCHEDULED'].includes(inst.status)) continue;
      const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, payment_due_reminded_at: null, payment_due_by: b.payment_due_by }, data: { payment_due_reminded_at: now } });
      if (!claimed.count) continue;
      const kind = (b.payment_due_kind === 'balance' ? 'balance' : 'deposit') as PaymentDueKind;
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
      select: { id: true, payment_due_kind: true, payment_plan: true, installments: { where: { kind: 'charge' }, select: { sequence: true, status: true, attempts: true } } },
      orderBy: { payment_due_by: 'asc' },
      take: BATCH,
    });
    let cancelled = 0;
    for (const b of overdue) {
      const inst = dueInstallment(b, b.installments);
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
