/**
 * Event budget from real bookings. A booking on the event is "committed" once the vendor accepts,
 * and "paid" as its charges go through. Manual lines (decor bought elsewhere, tips) keep their own
 * spent figure. Pure, so it is unit-tested.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BudgetBooking {
  id: string;
  status: string;
  amount: number;
  service_fee: number;
  /** charges actually paid, net of refunds (price + fee) */
  paid: number;
  vendor_name: string;
  title: string;
  category: string | null;
}

export interface BudgetLine {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  note: string | null;
  booking_id: string | null;
}

const COMMITTED = new Set(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);

export function summariseBudget(totalBudget: number | null, lines: BudgetLine[], bookings: BudgetBooking[]) {
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const linked = new Set<string>();

  const rows = lines.map((l) => {
    const b = l.booking_id ? byId.get(l.booking_id) : undefined;
    if (b) linked.add(b.id);
    const committed = b ? (COMMITTED.has(b.status) ? round2(b.amount + b.service_fee) : 0) : round2(l.allocated);
    return {
      ...l,
      // booked lines: spent follows real payments; manual lines keep what the planner entered
      spent: b ? round2(b.paid) : round2(l.spent),
      committed,
      booking: b ? { id: b.id, status: b.status, vendor_name: b.vendor_name, title: b.title } : null,
    };
  });

  const unassigned = bookings
    .filter((b) => !linked.has(b.id) && COMMITTED.has(b.status))
    .map((b) => ({ id: b.id, vendor_name: b.vendor_name, title: b.title, category: b.category, total: round2(b.amount + b.service_fee), paid: round2(b.paid), status: b.status }));

  const allocated = round2(rows.reduce((s, r) => s + r.allocated, 0));
  const committed = round2(rows.reduce((s, r) => s + r.committed, 0) + unassigned.reduce((s, u) => s + u.total, 0));
  const spent = round2(rows.reduce((s, r) => s + r.spent, 0) + unassigned.reduce((s, u) => s + u.paid, 0));
  const budget = totalBudget != null ? round2(totalBudget) : null;

  return {
    total_budget: budget,
    allocated,
    committed,
    spent,
    // what is left of the overall budget after everything committed
    remaining: budget != null ? round2(budget - committed) : null,
    over_budget: budget != null && committed > budget,
    lines: rows,
    unassigned_bookings: unassigned,
  };
}
