import { round2 } from './money-text';

/**
 * One money ledger per user (GET /payments/transactions), built from what the payment engine
 * records: installments for what a customer was charged and refunded, payment_transactions for
 * what a vendor was paid, charged in commission, gave back, owed or withdrew.
 *
 * Amounts are signed from the reader's side: money in is +, money out is -.
 */
export type LedgerType = 'payment' | 'refund' | 'payout' | 'fee';
export type LedgerStatus = 'completed' | 'pending' | 'failed' | 'refunded';

export interface LedgerRow {
  id: string;
  date: Date;
  type: LedgerType;
  /** the underlying record: charge / extra / security_deposit / legacy for charges; the transaction type for vendors */
  kind: string;
  description: string;
  booking_id: string | null;
  booking_title: string | null;
  amount: number;
  currency: string;
  status: LedgerStatus;
}

export interface LedgerInstallment {
  id: string;
  label: string;
  kind: string;
  status: string;
  amount: unknown;
  fee_amount: unknown;
  refunded_amount: unknown;
  capture_manually: boolean;
  paid_at: Date | null;
  paid_out_at?: Date | null;
  updated_at: Date;
  attempts?: number;
  /** a bank payment on its way (large bookings): pending until it clears */
  clearing_since?: Date | null;
  payment_method_type?: string | null;
  extra?: { kind: string } | null;
}

export interface LedgerBooking {
  id: string;
  title: string;
  status: string;
  amount: unknown;
  service_fee: unknown;
  currency: string | null;
  paid_at: Date | null;
  released_at?: Date | null;
  payout_credited_at?: Date | null;
  customer_name?: string | null;
  installments: LedgerInstallment[];
}

export interface LedgerTransaction {
  id: string;
  created_at: Date;
  type: string | null;
  status: string | null;
  amount: unknown;
  currency: string | null;
  booking_id: string | null;
}

const n = (v: unknown) => round2(Number(v ?? 0));
const ended = (status: string) => status === 'CANCELLED' || status === 'REJECTED';

/** A charge for a fee (approved fee, rental damage / late fees, deposit kept), not the price itself. */
const isFeeCharge = (i: LedgerInstallment) => i.kind === 'security_deposit' || (i.kind === 'extra' && (!i.extra || i.extra.kind === 'FEE'));

function txStatus(s: string | null): LedgerStatus {
  if (s === 'failed' || s === 'refund_failed') return 'failed';
  if (s === 'pending' || s === 'processing' || s === 'refund_pending') return 'pending';
  return 'completed';
}

/** What a customer paid and got back. */
export function customerLedger(bookings: LedgerBooking[], legacyRefunds: LedgerTransaction[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const titles = new Map(bookings.map((b) => [b.id, b.title]));
  for (const b of bookings) {
    const currency = b.currency ?? 'usd';
    const base = { booking_id: b.id, booking_title: b.title, currency };
    if (!b.installments.length) {
      // paid through hosted Checkout before installments existed
      if (b.paid_at) rows.push({ ...base, id: `charge-${b.id}`, date: b.paid_at, type: 'payment', kind: 'legacy', description: `Payment for ${b.title}`, amount: -n(Number(b.amount ?? 0) + Number(b.service_fee ?? 0)), status: 'completed' });
      continue;
    }
    for (const i of b.installments) {
      const type: LedgerType = isFeeCharge(i) ? 'fee' : 'payment';
      if (i.status === 'PAID' || i.status === 'REFUNDED') {
        rows.push({ ...base, id: `charge-${i.id}`, date: i.paid_at ?? i.updated_at, type, kind: i.kind, description: i.label, amount: -n(i.amount), status: i.status === 'REFUNDED' ? 'refunded' : 'completed' });
      } else if (i.status === 'FAILED') {
        rows.push({ ...base, id: `failed-${i.id}`, date: i.updated_at, type, kind: i.kind, description: `${i.label} (not taken)`, amount: -n(i.amount), status: 'failed' });
      } else if (i.status === 'PROCESSING' && i.capture_manually) {
        rows.push({ ...base, id: `hold-${i.id}`, date: i.updated_at, type, kind: i.kind, description: `Card hold: ${i.label}`, amount: -n(i.amount), status: 'pending' });
      } else if (i.status === 'PROCESSING' && i.clearing_since) {
        rows.push({ ...base, id: `bank-${i.id}`, date: i.clearing_since, type, kind: i.kind, description: `${i.label} (bank payment processing)`, amount: -n(i.amount), status: 'pending' });
      }
      if (n(i.refunded_amount) > 0) {
        // a bank refund takes a few days to arrive
        const bank = i.payment_method_type === 'us_bank_account';
        rows.push({ ...base, id: `refund-${i.id}`, date: i.updated_at, type: 'refund', kind: i.kind, description: `Refund: ${i.label}${bank ? ' (to your bank account)' : ''}`, amount: n(i.refunded_amount), status: 'completed' });
      }
    }
  }
  for (const t of legacyRefunds) {
    rows.push({ id: `tx-${t.id}`, date: t.created_at, type: 'refund', kind: t.type ?? 'booking_refund', description: 'Refund', booking_id: t.booking_id, booking_title: t.booking_id ? titles.get(t.booking_id) ?? null : null, amount: n(t.amount), currency: t.currency ?? 'usd', status: txStatus(t.status) });
  }
  return rows;
}

/** payment_transactions types on a vendor's account and how they read in the ledger. */
const VENDOR_TX: Record<string, { type: LedgerType; description: string; sign: 1 | -1 }> = {
  booking_payout: { type: 'payout', description: 'Paid to your bank account', sign: 1 },
  booking_earning: { type: 'payout', description: 'Added to your Vendly balance', sign: 1 },
  booking_cancellation_earning: { type: 'payout', description: 'Kept after a cancellation', sign: 1 },
  deposit_early_release: { type: 'payout', description: 'Deposit paid out early', sign: 1 },
  withdraw: { type: 'payout', description: 'Withdrawal to your bank', sign: -1 },
  // stored positive when taken, negative when handed back with a refund
  vendly_commission: { type: 'fee', description: 'Vendly commission', sign: -1 },
  vendor_give_back: { type: 'refund', description: 'Money given back to the customer', sign: -1 },
  // stored negative: money the vendor owes back (a refund after payout, an early deposit on a cancelled booking)
  payout_recovery: { type: 'refund', description: 'Taken back from your balance', sign: 1 },
};
export const VENDOR_TX_TYPES = Object.keys(VENDOR_TX);

/**
 * What a vendor was paid and charged: each customer payment's vendor part (held until the job is
 * released), refunds of it, and every payout, commission, give-back, recovery and withdrawal.
 */
export function vendorLedger(bookings: LedgerBooking[], txs: LedgerTransaction[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const titles = new Map(bookings.map((b) => [b.id, b.title]));
  for (const b of bookings) {
    const currency = b.currency ?? 'usd';
    const base = { booking_id: b.id, booking_title: b.title, currency };
    const from = b.customer_name ? ` from ${b.customer_name}` : '';
    if (!b.installments.length) {
      if (b.paid_at) {
        const settled = !!b.payout_credited_at || !!b.released_at || ended(b.status);
        rows.push({ ...base, id: `pay-${b.id}`, date: b.paid_at, type: 'payment', kind: 'legacy', description: `Customer payment${from}`, amount: n(b.amount), status: settled ? 'completed' : 'pending' });
      }
      continue;
    }
    for (const i of b.installments) {
      // the customer's bank payment is on its way: shown, but not counted as received until it clears
      if (i.status === 'PROCESSING' && i.clearing_since) {
        const part = n(Math.max(0, Number(i.amount) - Number(i.fee_amount)));
        if (part > 0) rows.push({ ...base, id: `pay-${i.id}`, date: i.clearing_since, type: 'payment', kind: i.kind, description: `${i.label}${from} (bank payment processing)`, amount: part, status: 'pending' });
        continue;
      }
      if (i.status !== 'PAID' && i.status !== 'REFUNDED') continue;
      // the vendor's part: the Vendly Protection fee never is
      const part = n(Math.max(0, Number(i.amount) - Number(i.fee_amount)));
      if (part <= 0) continue;
      const held = !i.paid_out_at && !b.released_at && !ended(b.status);
      rows.push({ ...base, id: `pay-${i.id}`, date: i.paid_at ?? i.updated_at, type: 'payment', kind: i.kind, description: `${i.label}${from}`, amount: part, status: i.status === 'REFUNDED' ? 'refunded' : held ? 'pending' : 'completed' });
      const back = n(Math.min(part, Number(i.refunded_amount)));
      if (back > 0) rows.push({ ...base, id: `refund-${i.id}`, date: i.updated_at, type: 'refund', kind: i.kind, description: `Refunded to the customer: ${i.label}`, amount: -back, status: 'completed' });
    }
  }
  for (const t of txs) {
    const def = t.type ? VENDOR_TX[t.type] : undefined;
    if (!def) continue;
    const amount = n(Number(t.amount ?? 0) * def.sign);
    rows.push({
      id: `tx-${t.id}`,
      date: t.created_at,
      type: def.type,
      kind: t.type!,
      description: t.type === 'vendly_commission' && amount > 0 ? 'Vendly commission returned with a refund' : def.description,
      booking_id: t.booking_id,
      booking_title: t.booking_id ? titles.get(t.booking_id) ?? null : null,
      amount,
      currency: t.currency ?? 'usd',
      status: txStatus(t.status),
    });
  }
  return rows;
}

export interface LedgerFilter {
  type?: 'all' | LedgerType;
  from?: Date | null;
  to?: Date | null;
  q?: string | null;
}

/** Newest first, filtered by type, date range (inclusive) and a search over booking title and description. */
export function filterLedger(rows: LedgerRow[], f: LedgerFilter): LedgerRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows
    .filter((r) => !f.type || f.type === 'all' || r.type === f.type)
    .filter((r) => !f.from || r.date >= f.from)
    .filter((r) => !f.to || r.date <= f.to)
    .filter((r) => !q || (r.booking_title ?? '').toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id));
}

/** Money in and out over the rows (completed and pending ones; failed charges moved nothing). */
export function ledgerTotals(rows: LedgerRow[]) {
  const live = rows.filter((r) => r.status !== 'failed');
  return {
    in: round2(live.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)),
    out: round2(live.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0)),
  };
}
