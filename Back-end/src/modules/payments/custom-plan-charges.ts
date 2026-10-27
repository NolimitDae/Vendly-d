import { ConflictException } from '@nestjs/common';
import { InstallmentStatus, PaymentPlan } from 'prisma/generated/enums';
import type { Prisma } from 'prisma/generated/client';
import { CustomPayment, CustomPlan } from './custom-plan';

const cents = (n: unknown) => Math.round(Number(n) * 100);

/** What is still owed on a confirmed booking for a new plan: its charges not made yet (custom-plan.ts). */
export function unpaidCharges<T extends { kind: string; status: InstallmentStatus | string; amount: unknown; fee_amount: unknown }>(installments: T[]) {
  const charges = installments.filter((i) => i.kind === 'charge');
  const unpaid = charges.filter((i) => i.status === InstallmentStatus.SCHEDULED || i.status === InstallmentStatus.FAILED);
  return {
    unpaid,
    owed: cents(unpaid.reduce((s, i) => s + Number(i.amount), 0)) / 100,
    feeOwed: cents(unpaid.reduce((s, i) => s + Number(i.fee_amount), 0)) / 100,
    // a charge or card hold going through: the plan can't change under it
    inFlight: charges.some((i) => i.status === InstallmentStatus.PROCESSING),
    paidCount: charges.filter((i) => i.status === InstallmentStatus.PAID || i.status === InstallmentStatus.REFUNDED).length,
  };
}

/**
 * Applies an agreed plan to a confirmed booking, inside the transaction that executes its amendment: the
 * unpaid charges are cancelled (kept for the record) and the plan's payments added after them; paid
 * charges, add-ons, fees and rental holds are left alone. A missed payment the plan replaces no longer
 * counts down (its window closes). Refuses when the money moved since the plan was proposed.
 */
export async function replaceUnpaidCharges(tx: Prisma.TransactionClient, bookingId: string, plan: CustomPlan & { owed: number }, now = new Date()) {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { currency: true, installments: true } });
  const { unpaid, owed, inFlight } = unpaidCharges(b.installments);
  if (inFlight) throw new ConflictException('A payment on this booking is going through right now. Please try again in a few minutes.');
  if (cents(owed) !== cents(plan.owed)) {
    throw new ConflictException('The payments on this booking changed since this plan was proposed, so it no longer adds up. Ask the vendor to propose it again.');
  }
  const cancelled = await tx.bookingInstallment.updateMany({
    where: { id: { in: unpaid.map((i) => i.id) }, status: { in: [InstallmentStatus.SCHEDULED, InstallmentStatus.FAILED] } },
    data: { status: InstallmentStatus.CANCELLED, next_attempt_at: null },
  });
  if (cancelled.count !== unpaid.length) throw new ConflictException('A payment on this booking just started. Please try again in a minute.');
  let sequence = b.installments.reduce((m, i) => Math.max(m, i.sequence), 0);
  const rows = [];
  for (const p of plan.payments as CustomPayment[]) {
    rows.push(
      await tx.bookingInstallment.create({
        data: {
          booking_id: bookingId,
          sequence: ++sequence,
          label: p.label,
          amount: p.amount,
          fee_amount: p.fee_amount,
          currency: b.currency ?? 'usd',
          // "now", or a date that passed before the customer agreed: charged straight away
          due_at: p.due_at && new Date(p.due_at) > now ? new Date(p.due_at) : now,
          kind: 'charge',
        },
      }),
    );
  }
  const kept: CustomPlan = { pay_after: plan.pay_after, payments: plan.payments };
  await tx.booking.update({
    where: { id: bookingId },
    data: { payment_plan: PaymentPlan.CUSTOM, custom_payment_plan: kept as unknown as Prisma.InputJsonValue, payment_due_by: null, payment_due_kind: null, payment_due_reminded_at: null },
  });
  return rows;
}
