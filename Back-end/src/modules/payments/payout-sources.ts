/**
 * Which customer payments a vendor payout is sent from. A transfer tied to the customer's own charge
 * (Stripe's source_transaction) goes through even before that charge has settled into Vendly's
 * available balance, and the money becomes available to the vendor as soon as the charge clears. Without
 * it a payout on the day the customer paid could fail for lack of settled funds.
 */
export interface PayoutSource {
  paymentIntentId: string;
  /** how much of the charge can still be sent from it (what's left after refunds and earlier transfers) */
  room: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits `amount` across the customer's payments, largest first (fewest transfers), never more than a
 * payment's room. Returns the parts and what didn't fit on any payment.
 */
export function splitAcrossPayments(amount: number, sources: PayoutSource[]): { parts: { paymentIntentId: string; amount: number }[]; rest: number } {
  // one entry per payment (the same payment can't be listed twice)
  const byId = new Map<string, number>();
  for (const s of sources) if (s.paymentIntentId && s.room > 0) byId.set(s.paymentIntentId, round2((byId.get(s.paymentIntentId) ?? 0) + s.room));
  const ordered = [...byId.entries()].sort((a, b) => b[1] - a[1]);
  let left = round2(Math.max(0, amount));
  const parts: { paymentIntentId: string; amount: number }[] = [];
  for (const [paymentIntentId, room] of ordered) {
    if (left <= 0) break;
    const take = round2(Math.min(left, room));
    if (take <= 0) continue;
    parts.push({ paymentIntentId, amount: take });
    left = round2(left - take);
  }
  return { parts, rest: left };
}
