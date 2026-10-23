import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from './api';

export type AddOnKind = 'ADD_ON' | 'FEE';
export type AddOnUnit = 'FIXED' | 'PER_PERSON' | 'PER_HOUR' | 'PER_ITEM';

/** An add-on or fee in the vendor's library (or custom to one package). */
export interface AddOn {
  id: string;
  kind: AddOnKind;
  name: string;
  description: string | null;
  price: number;
  price_unit: AddOnUnit;
  /** "$50.00 per hour" */
  price_text: string;
  max_quantity: number | null;
  in_library: boolean;
  /** packages it's on (vendor library only) */
  listing_ids?: string[];
}

export interface AddOnSuggestion {
  name: string;
  price_unit: AddOnUnit;
  description?: string;
}

export interface AddOnInput {
  kind?: AddOnKind;
  name: string;
  description?: string;
  price: number;
  price_unit?: AddOnUnit;
  max_quantity?: number | null;
  in_library?: boolean;
  listing_ids?: string[];
}

export type ExtraStatus = 'INCLUDED' | 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'IN_REVIEW' | 'WAIVED';

/** An add-on or fee on a booking: picked when booking (INCLUDED) or sent by the vendor later. */
export interface Extra {
  id: string;
  kind: AddOnKind;
  name: string;
  description: string | null;
  /** "Bartender: $40.00 × 5 hours" */
  label: string;
  unit_price: number;
  price_unit: AddOnUnit;
  quantity: number;
  amount: number;
  /** Vendly Protection fee the customer pays on top (add-ons sent after booking only) */
  fee_amount: number;
  total: number;
  note: string | null;
  status: ExtraStatus;
  created_at: string;
  responded_at: string | null;
  decline_reason: string | null;
  review_requested_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  /** fees still waiting: when "Ask Vendly to review" unlocks */
  can_escalate_at: string | null;
  payment: {
    installment_id: string;
    status: 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
    paid_at: string | null;
    last_error: string | null;
    refunded_amount: number;
  } | null;
}

export interface ExtrasMeta {
  waiting_on_customer: number;
  waiting_total: number;
  can_request: { add_on: boolean; fee: boolean };
}

/** What a customer picks when booking. `quantity` is only sent for "each" add-ons. */
export interface AddOnPick {
  add_on_id: string;
  quantity?: number;
}

export interface GiveBackResult {
  amount: number;
  lowered: number;
  refunded: number;
  recovered_from_balance: number;
}

export const AddOnsService = {
  // vendor library
  list: (kind?: AddOnKind, listingId?: string) =>
    api.get<{ success: boolean; data: AddOn[] }>('/vendor/add-ons', { params: { kind, listing_id: listingId } }),
  suggestions: (kind: AddOnKind) => api.get<{ success: boolean; data: AddOnSuggestion[] }>('/vendor/add-ons/suggestions', { params: { kind } }),
  create: (data: AddOnInput) => api.post<{ success: boolean; data: AddOn }>('/vendor/add-ons', data),
  update: (id: string, data: Partial<AddOnInput>) => api.patch<{ success: boolean; data: AddOn }>(`/vendor/add-ons/${id}`, data),
  remove: (id: string) => api.delete(`/vendor/add-ons/${id}`),
  attach: (addOnIds: string[], listingIds: string[], mode: 'add' | 'remove' = 'add') =>
    api.post<{ success: boolean; data: { added?: number; removed?: number } }>('/vendor/add-ons/attach', { add_on_ids: addOnIds, listing_ids: listingIds, mode }),
  forListing: (listingId: string) => api.get<{ success: boolean; data: { add_ons: AddOn[]; fees: AddOn[] } }>(`/vendor/add-ons/listing/${listingId}`),
  setForListing: (listingId: string, addOnIds: string[]) =>
    api.put<{ success: boolean; data: { add_ons: AddOn[]; fees: AddOn[] } }>(`/vendor/add-ons/listing/${listingId}`, { add_on_ids: addOnIds }),

  // on a booking
  extras: (bookingId: string) => api.get<{ success: boolean; data: Extra[]; meta: ExtrasMeta }>(`/bookings/${bookingId}/extras`),
  request: (
    bookingId: string,
    data: { kind: AddOnKind; add_on_id?: string; name?: string; unit_price?: number; price_unit?: AddOnUnit; quantity?: number; note?: string },
  ) => api.post<{ success: boolean; data: Extra }>(`/bookings/${bookingId}/extras`, data),
  approve: (extraId: string, paymentMethodId?: string) =>
    api.post<{ success: boolean; data: Extra & { paid: boolean } }>(`/booking-extras/${extraId}/approve`, paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
  decline: (extraId: string, reason?: string) => api.post(`/booking-extras/${extraId}/decline`, reason ? { reason } : {}),
  withdraw: (extraId: string) => api.post(`/booking-extras/${extraId}/withdraw`),
  escalate: (extraId: string, note: string) => api.post(`/booking-extras/${extraId}/escalate`, { note }),
  giveBack: (bookingId: string, amount: number, reason: string) =>
    api.post<{ success: boolean; data: GiveBackResult }>(`/bookings/${bookingId}/give-back`, { amount, reason }),
};

/** A booking's add-ons and fees, reloaded whenever the screen comes back into focus. */
export function useBookingExtras(bookingId: string) {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [meta, setMeta] = useState<ExtrasMeta | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await AddOnsService.extras(bookingId);
      setExtras(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch {
      // keep what we have
    } finally {
      setLoaded(true);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { extras, meta, loaded, reload };
}

// ─── Wording ──────────────────────────────────────────────────────────────────

export const UNIT_OPTIONS: { value: AddOnUnit; label: string }[] = [
  { value: 'FIXED', label: 'Once' },
  { value: 'PER_PERSON', label: 'Per person' },
  { value: 'PER_HOUR', label: 'Per hour' },
  { value: 'PER_ITEM', label: 'Each' },
];

export const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

/** "$50.00 per hour", for prices typed in a form before the server formats them. */
export function priceText(price: number, unit: AddOnUnit) {
  const p = money(price);
  return unit === 'PER_PERSON' ? `${p} per person` : unit === 'PER_HOUR' ? `${p} per hour` : unit === 'PER_ITEM' ? `${p} each` : p;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Package (listing) price units that are counted out: guests, hours or days. */
export type PackageUnit = 'person' | 'hour' | 'day';
export const countedUnit = (u?: string | null): PackageUnit | null => (u === 'person' || u === 'hour' || u === 'day' ? u : null);

const QTY_WORD: Record<PackageUnit, [string, string]> = { person: ['guest', 'guests'], hour: ['hour', 'hours'], day: ['day', 'days'] };
export const quantityWord = (u: PackageUnit, plural = true) => QTY_WORD[u][plural ? 1 : 0];

/** "50–300 guests", "At least 2 hours", "Up to 3 days", or null when there are no limits. */
export function rangeText(u: string | null | undefined, min?: number | null, max?: number | null) {
  const unit = countedUnit(u);
  if (!unit) return null;
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  const [one, many] = QTY_WORD[unit];
  if (lo && hi) return `${lo}–${hi} ${many}`;
  if (lo) return `At least ${lo} ${lo === 1 ? one : many}`;
  if (hi) return `Up to ${hi} ${hi === 1 ? one : many}`;
  return null;
}

/** " / person", " / hour", " / day", " / event", or "" for a fixed price. */
export const unitSuffix = (u?: string | null) => (u && u !== 'fixed' ? ` / ${u}` : '');

/**
 * Rough price while the customer is still choosing, with the server's rules (backend add-ons/pricing.ts).
 * The booking summary shows the real figure from the contract preview.
 */
export function estimate(
  pkg: { price: number; price_unit?: string | null; min_quantity?: number | null; quote?: boolean },
  ev: { guests?: number; hours?: number | null },
  picked: { addOn: AddOn; quantity: number }[],
) {
  const unit = pkg.quote ? null : countedUnit(pkg.price_unit);
  const min = pkg.min_quantity && pkg.min_quantity > 0 ? pkg.min_quantity : 0;
  let base = Number(pkg.price);
  if (unit === 'person') base *= ev.guests ?? 0;
  if (unit === 'hour') base *= Math.max(ev.hours ?? 0, min);
  if (unit === 'day') base *= Math.max(1, min);
  const extras = picked.reduce((sum, { addOn, quantity }) => {
    const q = addOn.price_unit === 'PER_PERSON' ? ev.guests ?? 0 : addOn.price_unit === 'PER_HOUR' ? ev.hours ?? 0 : addOn.price_unit === 'PER_ITEM' ? quantity : 1;
    return sum + addOn.price * q;
  }, 0);
  return Math.round((base + extras) * 100) / 100;
}
