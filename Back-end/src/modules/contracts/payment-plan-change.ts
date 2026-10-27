import { CustomPayment, CustomPlan, readCustomPlan } from 'src/modules/payments/custom-plan';

/** One payment of a booking's plan as the comparison shows it: what, how much, when, and where it stands. */
export interface PlanRow {
  label: string;
  amount: number;
  /** null: when the vendor accepts / as soon as the customer agrees */
  due_at: string | null;
  /** the charge's status (SCHEDULED, PAID, FAILED, ...); null for a payment that is only proposed */
  status: string | null;
}

/**
 * A payment plan proposed on a confirmed booking (payment-plans.service.ts), kept in the merge data of
 * its amendment: the agreed payments, what they replace, and what was owed when it was proposed (the
 * plan is refused at signing if that changed).
 */
export interface PlanChange extends CustomPlan {
  owed: number;
  fee_owed: number;
  paid_count: number;
  note: string | null;
  /** the payments as they were when it was proposed: paid ones and the ones it replaces */
  before: PlanRow[];
}

export function readPlanChange(mergeData: unknown): PlanChange | null {
  const c = (mergeData as { payment_plan_change?: PlanChange } | null)?.payment_plan_change;
  const plan = c && typeof c === 'object' ? readCustomPlan(c) : null;
  if (!c || !plan) return null;
  return {
    ...plan,
    owed: Number(c.owed),
    fee_owed: Number(c.fee_owed ?? 0),
    paid_count: Number(c.paid_count ?? 0),
    note: c.note ?? null,
    before: Array.isArray(c.before) ? c.before : [],
  };
}

export const isPlanChange = (c: { merge_data?: unknown }) => !!readPlanChange(c.merge_data);

/** The rows of a proposed plan for the comparison. */
export const proposedRows = (payments: CustomPayment[]): PlanRow[] => payments.map((p) => ({ label: p.label, amount: p.amount, due_at: p.due_at, status: null }));
