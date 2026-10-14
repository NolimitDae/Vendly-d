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
};

const round = (n: number) => Math.round(n * 100) / 100;

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

  const depositShare = plan === PaymentPlan.DEPOSIT_50 ? 0.5 : plan === PaymentPlan.DEPOSIT_25 ? 0.25 : 1;
  const leadDays = plan === PaymentPlan.DEPOSIT_50 ? 7 : 14;
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

/** Retry policy: three attempts spread over 48 hours (0h, 24h, 48h). */
export const MAX_ATTEMPTS = 3;
export const RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Release rules: 3-day auto-approve after completion, 48h after proof, immediately on approval. */
export const AUTO_RELEASE_DAYS = 3;
export const PROOF_RELEASE_HOURS = 48;
