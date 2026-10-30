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
  /** a DEPOSIT_CUSTOM balance charged once the customer confirms the work, not on its due date */
  after_service?: boolean;
}

/**
 * A package's own deposit (DEPOSIT_CUSTOM, owner's ask, Nov 2026: "25 and 50 deposit and pay balance after
 * service, or custom"): the share taken when the vendor accepts, and when the balance is due, either a
 * number of days before the event or after the service. After the service, the balance is charged once the
 * customer confirms the work, or when the window to report a problem closes without one (48 hours after
 * the vendor's photo proof, else 3 days after completion; payments.service.ts chargeAfterServiceBalance).
 */
export interface DepositTerms {
  deposit_percent?: number | null;
  balance_due_days?: number | null;
  balance_after_service?: boolean | null;
}

export const MIN_DEPOSIT_PERCENT = 10;
export const MAX_DEPOSIT_PERCENT = 90;
export const MIN_BALANCE_DAYS = 1;
export const MAX_BALANCE_DAYS = 60;
/** A custom deposit's balance lead time when none was given. */
const DEFAULT_BALANCE_DAYS = 7;

/** The deposit terms a DEPOSIT_CUSTOM package or booking has (null for every other plan). */
export function depositTermsOf(plan: PaymentPlan | string | null | undefined, row: DepositTerms | null | undefined): Required<DepositTerms> | null {
  if (plan !== PaymentPlan.DEPOSIT_CUSTOM) return null;
  const percent = Math.min(MAX_DEPOSIT_PERCENT, Math.max(MIN_DEPOSIT_PERCENT, Math.round(Number(row?.deposit_percent ?? 50))));
  const afterService = !!row?.balance_after_service;
  const days = Math.min(MAX_BALANCE_DAYS, Math.max(MIN_BALANCE_DAYS, Math.round(Number(row?.balance_due_days ?? DEFAULT_BALANCE_DAYS))));
  return { deposit_percent: percent, balance_due_days: afterService ? null : days, balance_after_service: afterService };
}

/** The contract's payment sentence (its `payment_schedule`) for a custom deposit. */
export function depositContractSentence(terms: Required<DepositTerms>): string {
  const days = terms.balance_due_days === 1 ? '1 day' : `${terms.balance_due_days} days`;
  const balance = terms.balance_after_service
    ? 'the balance is charged after the service, once the Customer confirms the work or, if the Customer does not report a problem, when the time to report one ends'
    : `the balance is charged ${days} before the event`;
  return `A ${terms.deposit_percent}% deposit is paid through Vendly when the Vendor accepts and signs this agreement, and ${balance}.`;
}

/** True when a booking's balance waits for the service (a DEPOSIT_CUSTOM package with the balance after it). */
export const balanceAfterService = (plan: PaymentPlan | string | null | undefined, terms: DepositTerms | null | undefined) =>
  !!depositTermsOf(plan, terms)?.balance_after_service;

/** Vendor-facing descriptions of the four presets. */
export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  FULL_ON_ACCEPT: 'Full payment when you accept',
  DEPOSIT_50: '50% deposit when you accept, balance 7 days before the event',
  DEPOSIT_25: '25% deposit when you accept, balance 14 days before the event',
  PAY_AFTER_SERVICE: 'Card held when you accept, charged after the service',
  // the wording with the package's own numbers is planLabel's
  DEPOSIT_CUSTOM: 'A deposit when you accept, balance later',
  // agreed for one booking (custom-plan.ts), never a listing's plan
  CUSTOM: 'A payment plan agreed with the customer',
};

/** The plans a package (or a category default) can use; CUSTOM is only ever agreed on a booking. */
export const LISTING_PAYMENT_PLANS: PaymentPlan[] = [PaymentPlan.FULL_ON_ACCEPT, PaymentPlan.DEPOSIT_50, PaymentPlan.DEPOSIT_25, PaymentPlan.PAY_AFTER_SERVICE, PaymentPlan.DEPOSIT_CUSTOM];

/** A plan in words, with a custom deposit's own numbers. */
export function planLabel(plan: PaymentPlan, terms?: DepositTerms | null): string {
  const t = depositTermsOf(plan, terms);
  if (!t) return PAYMENT_PLAN_LABELS[plan];
  const days = t.balance_due_days === 1 ? '1 day' : `${t.balance_due_days} days`;
  return `${t.deposit_percent}% deposit when you accept, balance ${t.balance_after_service ? 'after the service' : `${days} before the event`}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Share of the price taken as a deposit on acceptance (1 = everything). */
export const depositShareOf = (plan: PaymentPlan, terms?: DepositTerms | null) => {
  const custom = depositTermsOf(plan, terms);
  if (custom) return custom.deposit_percent / 100;
  return plan === PaymentPlan.DEPOSIT_50 ? 0.5 : plan === PaymentPlan.DEPOSIT_25 ? 0.25 : 1;
};
/** Days before the event a deposit plan's balance is due. */
const balanceLeadDaysOf = (plan: PaymentPlan, terms?: DepositTerms | null) =>
  depositTermsOf(plan, terms)?.balance_due_days ?? (plan === PaymentPlan.DEPOSIT_50 ? 7 : 14);

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
 * - A custom deposit with the balance after the service splits with or without an event date: the
 *   balance waits for the customer's confirmation (shown as due at the event, when there is one).
 */
export function buildSchedule(opts: {
  plan: PaymentPlan | null | undefined;
  price: number;
  serviceFee: number;
  eventStart?: Date | null;
  acceptedAt?: Date;
  terms?: DepositTerms | null;
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

  const depositShare = depositShareOf(plan, opts.terms);
  if (depositShare >= 1) return full();
  if (balanceAfterService(plan, opts.terms)) {
    const deposit = round(price * depositShare);
    return [
      { sequence: 1, label: `${Math.round(depositShare * 100)}% deposit`, amount: round(deposit + fee), fee_amount: fee, due_at: now, capture_manually: false },
      { sequence: 2, label: 'Balance (after the service)', amount: round(price - deposit), fee_amount: 0, due_at: eventStart && eventStart > now ? eventStart : now, capture_manually: false, after_service: true },
    ];
  }
  const leadDays = balanceLeadDaysOf(plan, opts.terms);
  if (!eventStart) return full();

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
export function rebasedAmounts(opts: { plan: PaymentPlan | null | undefined; count: number; price: number; serviceFee: number; terms?: DepositTerms | null }): { amount: number; fee_amount: number }[] | null {
  const price = round(opts.price);
  const fee = round(opts.serviceFee);
  if (opts.count === 1) return [{ amount: round(price + fee), fee_amount: fee }];
  const share = depositShareOf(opts.plan ?? PaymentPlan.FULL_ON_ACCEPT, opts.terms);
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
export function eventLinkedDueAt(plan: PaymentPlan | null | undefined, chargeIndex: number, eventStart: Date, now = new Date(), terms?: DepositTerms | null): Date | null {
  let due: Date | null = null;
  if (plan === PaymentPlan.PAY_AFTER_SERVICE && chargeIndex === 0) due = eventStart;
  // a balance after the service is shown as due at the event (it is charged on the customer's confirmation)
  else if (balanceAfterService(plan, terms) && chargeIndex === 1) due = eventStart;
  else if ((plan === PaymentPlan.DEPOSIT_50 || plan === PaymentPlan.DEPOSIT_25 || plan === PaymentPlan.DEPOSIT_CUSTOM) && chargeIndex === 1)
    due = new Date(eventStart.getTime() - balanceLeadDaysOf(plan, terms) * DAY);
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
