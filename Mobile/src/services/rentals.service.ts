import { api } from './api';

export type RentalItemStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';

export interface RentalItem {
  id: string;
  vendor_id: string;
  title: string;
  description: string;
  images: string[];
  image_keys?: string[];
  category_id?: string | null;
  daily_rate: number;
  deposit_amount: number;
  quantity: number;
  turnaround_hours: number;
  /** how the customer gets it: the vendor delivers it, and/or they pick it up (missing on older data: both) */
  offers_delivery?: boolean;
  offers_pickup?: boolean;
  location?: string | null;
  status: RentalItemStatus;
  /** the vendor's instructions for using the equipment */
  dos?: string[] | null;
  donts?: string[] | null;
  vendor?: { id: string; name: string; avatar_url?: string | null };
  /** Free units for the dates searched (browse with dates) */
  available?: number;
  /** Free units today (vendor inventory) */
  available_today?: number;
  calendar?: { date: string; available: number }[];
}

export interface RentalReservation {
  id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  status: 'ACTIVE' | 'RETURNED' | 'CANCELLED';
  booking: { id: string; status: string; customer?: { id: string; name: string } };
}

export interface RentalLine {
  item_id: string;
  quantity: number;
}

export interface RentalDeliverySettings {
  travel_fee_enabled: boolean;
  travel_free_miles: number | null;
  travel_per_mile: number | null;
  travel_base_fee: number | null;
  travel_round_trip: boolean;
  /** delivery miles are measured from the business address: needed before the fee can be on */
  has_business_address: boolean;
  text: string | null;
}

export interface RentalQuote {
  days: number;
  subtotal: number;
  service_fee: number;
  security_deposit: number;
  due_on_accept: number;
  available: boolean;
  /** the vendor's delivery fee: part of the price (0 for a pickup or none) */
  delivery_fee?: number;
  /** the vendor's delivery rates in a line, when they charge one */
  delivery_terms?: string | null;
  /** this order's delivery fee once there's an address (UNPRICED: the address couldn't be placed) */
  delivery?: { status: 'PRICED' | 'UNPRICED'; miles: number | null; fee: number | null; label: string; message: string | null } | null;
  /** what every item in the order offers */
  handover?: { delivery: boolean; pickup: boolean };
  lines: { item_id: string; title: string; quantity: number; available: number; ok: boolean; daily_rate: number; deposit_amount: number }[];
}

type Res<T> = { success: boolean; data: T };

export const RentalsService = {
  browse: (params: { search?: string; vendor_id?: string; start_date?: string; end_date?: string; page?: number }) =>
    api.get<Res<RentalItem[]>>('/rentals', { params }),
  item: (id: string) => api.get<Res<RentalItem>>(`/rentals/${id}`),
  quote: (body: { lines: RentalLine[]; start_date: string; end_date: string; venue_address?: string; customer_comes?: boolean }) => api.post<Res<RentalQuote>>('/rentals/quote', body),
  book: (body: { lines: RentalLine[]; start_date: string; end_date: string; venue_address?: string; customer_comes?: boolean; message?: string; payment_method_id: string }) =>
    api.post<Res<{ id: string; status: string; title: string }>>('/rentals/book', body),

  mine: () => api.get<Res<RentalItem[]>>('/vendor/rentals'),
  /** The vendor's delivery fee on rental orders (one for all their items) */
  deliveryFee: () => api.get<Res<RentalDeliverySettings>>('/vendor/rentals/delivery-fee'),
  saveDeliveryFee: (body: Record<string, unknown>) => api.patch<Res<RentalDeliverySettings>>('/vendor/rentals/delivery-fee', body),
  mineOne: (id: string) => api.get<Res<RentalItem & { reservations: RentalReservation[] }>>(`/vendor/rentals/${id}`),
  save: (form: FormData, id?: string) => {
    const config = { headers: { 'Content-Type': 'multipart/form-data' } };
    return id ? api.patch<Res<RentalItem>>(`/vendor/rentals/${id}`, form, config) : api.post<Res<RentalItem>>('/vendor/rentals', form, config);
  },
  setStatus: (id: string, status: RentalItemStatus) => {
    const fd = new FormData();
    fd.append('status', status);
    return api.patch<Res<RentalItem>>(`/vendor/rentals/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  remove: (id: string) => api.delete(`/vendor/rentals/${id}`),
  recordReturn: (bookingId: string, body: { notes?: string; damage_fee?: number; late_fee?: number; photos?: { uri: string; name: string; type: string }[] }) => {
    const fd = new FormData();
    if (body.notes) fd.append('notes', body.notes);
    if (body.damage_fee) fd.append('damage_fee', String(body.damage_fee));
    if (body.late_fee) fd.append('late_fee', String(body.late_fee));
    (body.photos ?? []).forEach((p) => fd.append('photos', p as unknown as Blob));
    return api.post<Res<{ fees: number; captured_from_deposit: number; charged_extra: number }>>(`/rentals/bookings/${bookingId}/return`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

/** yyyy-MM-dd in local time (what the backend treats as a whole rental day). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
