/** Small text helpers shared by receipts, the final invoice and the transaction history. */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "$1,234.50" (other currencies get their code: "EUR 12.00"). Negative amounts keep their sign: "-$5.00". */
export function money(n: unknown, currency?: string | null) {
  const v = round2(Number(n ?? 0));
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const code = (currency ?? 'usd').toLowerCase();
  const text = code === 'usd' ? `$${body}` : `${code.toUpperCase()} ${body}`;
  return v < 0 ? `-${text}` : text;
}

/** "Oct 23, 2026" in UTC (server-side; the apps show local times themselves). */
export function shortDate(d: Date | string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** What the booking is for: the package title, or the rented items ("Tent + 2 more"). */
export function bookingTitle(b: { listing?: { title: string } | null; rental_reservations?: { item: { title: string } | null }[] | null } | null | undefined) {
  if (b?.listing?.title) return b.listing.title;
  const items = (b?.rental_reservations ?? []).map((r) => r.item?.title).filter(Boolean) as string[];
  if (!items.length) return 'Booking';
  return items.length > 1 ? `${items[0]} + ${items.length - 1} more` : items[0];
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };

/** "Visa •••• 4242" */
export function cardText(card: { brand?: string | null; last4?: string | null } | null | undefined) {
  if (!card?.last4) return null;
  const brand = card.brand ? BRANDS[card.brand] ?? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card';
  return `${brand} •••• ${card.last4}`;
}
