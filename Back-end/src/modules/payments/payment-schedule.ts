import { PaymentPlan } from 'prisma/generated/enums';

const DAY = 24 * 60 * 60 * 1000;

export interface PlannedInstallment {
  sequence: number;
  label: string;
  /** total charged for this installment, including any fee portion */
  amount: number;
  fee_amount: number;
  due_at: Date;
  capture_manually: boolean;
}

/** Vendor-facing descriptions of the four presets. */
export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  FULL_ON_ACCEPT: 'Full payment when you accept',
  DEPOSIT_50: '50% deposit when you accept, balance 7 days before the event',
  DEPOSIT_25: '25% deposit when you accept, balance 14 days before the event',
  PAY_AFTER_SERVICE: 'Card held when you accept, charged after the service',
  // agreed for one booking (custom-plan.ts), never a listing's plan
  CUSTOM: 'A payment plan agreed with the customer',
};

/** The plans a package (or a category default) can use; CUSTOM is only ever agreed on a booking. */
export const LISTING_PAYMENT_PLANS: PaymentPlan[] = [PaymentPlan.FULL_ON_ACCEPT, PaymentPlan.DEPOSIT_50, PaymentPlan.DEPOSIT_25, PaymentPlan.PAY_AFTER_SERVICE];

const round = (n: number) => Math.round(n * 100) / 100;

/** Share of the price taken as a deposit on acceptance (1 = everything). */
export const depositShareOf = (plan: PaymentPlan) => (plan === PaymentPlan.DEPOSIT_50 ? 0.5 : plan === PaymentPlan.DEPOSIT_25 ? 0.25 : 1);
/** Days before the event a deposit plan's balance is due. */
const balanceLeadDaysOf = (plan: PaymentPlan) => (plan === PaymentPlan.DEPOSIT_50 ? 7 : 14);

/** Rental security deposit holds are placed this many days before pickup. */
export const SECURITY_HOLD_LEAD_DAYS = 1;

/**
 * Builds the installments for a booking from its payment plan.
 *
 * Rules (brief, Oct 2026):
 * - The Vendly Protection fee is always collected with the first charge.
 * - A balance that would fall due in the past (the event is sooner than the plan's lead time)
 *   is merged into the first charge, so nothing is ever "already overdue" at accept time.
 * - Deposit plans need an event date; without one the booking is charged in full on accept.
 * - PAY_AFTER_SERVICE authorizes the card when the event starts and captures on completion.
 */
export function buildSchedule(opts: {
  plan: PaymentPlan | null | undefined;
  price: number;
  serviceFee: number;
  eventStart?: Date | null;
  acceptedAt?: Date;
}): PlannedInstallment[] {
  const now = opts.acceptedAt ?? new Date();
  const price = round(opts.price);
  const fee = round(opts.serviceFee);
  const eventStart = opts.eventStart ? new Date(opts.eventStart) : null;
  const plan = opts.plan ?? PaymentPlan.FULL_ON_ACCEPT;

  const full = (): PlannedInstallment[] => [
    { sequence: 1, label: 'Full payment', amount: round(price + fee), fee_amount: fee, due_at: now, capture_manually: false },
  ];

  if (plan === PaymentPlan.PAY_AFTER_SERVICE) {
    return [
      {
        sequence: 1,
        label: 'Payment after service',
        amount: round(price + fee),
        fee_amount: fee,
        // charge at the event; the authorization is captured when the vendor completes the job
        due_at: eventStart && eventStart > now ? eventStart : now,
        capture_manually: true,
      },
    ];
  }

  const depositShare = depositShareOf(plan);
  const leadDays = balanceLeadDaysOf(plan);
  if (depositShare >= 1 || !eventStart) return full();

  const balanceDue = new Date(eventStart.getTime() - leadDays * DAY);
  if (balanceDue <= now) return full();

  const deposit = round(price * depositShare);
  const balance = round(price - deposit);
  return [
    { sequence: 1, label: `${Math.round(depositShare * 100)}% deposit`, amount: round(deposit + fee), fee_amount: fee, due_at: now, capture_manually: false },
    { sequence: 2, label: 'Balance', amount: balance, fee_amount: 0, due_at: balanceDue, capture_manually: false },
  ];
}

/**
 * New amounts for a booking's charges when its price changes before anything was paid, keeping the
 * schedule it already has (same rows, same due dates): one charge takes the price plus the fee; a
 * deposit plan's deposit and balance split it the way buildSchedule does. Null when the rows don't
 * have a shape this can rebase.
 */
export function rebasedAmounts(opts: { plan: PaymentPlan | null | undefined; count: number; price: number; serviceFee: number }): { amount: number; fee_amount: number }[] | null {
  const price = round(opts.price);
  const fee = round(opts.serviceFee);
  if (opts.count === 1) return [{ amount: round(price + fee), fee_amount: fee }];
  const share = depositShareOf(opts.plan ?? PaymentPlan.FULL_ON_ACCEPT);
  if (opts.count !== 2 || share >= 1) return null;
  const deposit = round(price * share);
  return [
    { amount: round(deposit + fee), fee_amount: fee },
    { amount: round(price - deposit), fee_amount: 0 },
  ];
}

/**
 * When a charge that follows the event date falls due once the event moves (same rules as
 * buildSchedule): a deposit plan's balance (the second charge) its lead time before the event, the
 * pay-after-service charge at the event. Never in the past. Null for charges that don't follow the date.
 */
export function eventLinkedDueAt(plan: PaymentPlan | null | undefined, chargeIndex: number, eventStart: Date, now = new Date()): Date | null {
  let due: Date | null = null;
  if (plan === PaymentPlan.PAY_AFTER_SERVICE && chargeIndex === 0) due = eventStart;
  else if ((plan === PaymentPlan.DEPOSIT_50 || plan === PaymentPlan.DEPOSIT_25) && chargeIndex === 1) due = new Date(eventStart.getTime() - balanceLeadDaysOf(plan) * DAY);
  if (!due) return null;
  return due > now ? due : now;
}

/** When a rental's security deposit hold is placed: shortly before pickup, never in the past. */
export function securityHoldAt(start: Date | null | undefined, now = new Date()): Date {
  return start ? new Date(Math.max(now.getTime(), start.getTime() - SECURITY_HOLD_LEAD_DAYS * DAY)) : now;
}

/** Retry policy: three attempts spread over 48 hours (0h, 24h, 48h). */
export const MAX_ATTEMPTS = 3;
export const RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Release rules: 3-day auto-approve after completion, 48h after proof, immediately on approval. */
export const AUTO_RELEASE_DAYS = 3;
export const PROOF_RELEASE_HOURS = 48;
