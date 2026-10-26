import { api } from './api';
import type { BookingFields, SignaturePayload } from './contracts.service';
import type { ChosenCustomization } from '../utils/packageOptions';

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface Booking {
  /** an open request closes on its own at this time */
  request_expires_at?: string | null;
  /** on a request: the vendor's suggested changes are waiting for the customer (the request can't close meanwhile) */
  changes_waiting?: boolean;
  id: string;
  status: BookingStatus;
  scheduled_at?: string;
  event_start_at?: string | null;
  event_end_at?: string | null;
  venue_address?: string | null;
  guest_count?: number | null;
  message?: string;
  amount?: number;
  service_fee?: number | string | null;
  paid_at?: string | null;
  /** set when the vendor didn't answer the request in time */
  expired_at?: string | null;
  payment_plan?: string | null;
  /** deposit plans: a missed deposit or balance to pay by payment_due_by, or the booking is cancelled */
  payment_state?: 'pending_deposit' | 'pending_balance' | null;
  payment_due_by?: string | null;
  /** who cancelled (CUSTOMER | VENDOR | SYSTEM | ADMIN), the reason picked, and the note (cancel_reason) */
  cancelled_by?: string | null;
  cancel_reason_label?: string | null;
  cancel_reason?: string | null;
  /** the vendor cancelled: other vendors in the category free on the date (customers, on the booking itself) */
  similar_vendors?: {
    items: { id: string; title: string; price: number; image: string | null; vendor_id: string; vendor_name: string | null; avg_rating: number | null }[];
    url: string;
    category_id: string;
    date: string;
  } | null;
  /** the customer's review, once they left one */
  review?: { id: string; rating: number; comment?: string | null } | null;
  early_released_amount?: number | string | null;
  /** on a request, for the vendor: their confirmed bookings on the same day */
  same_day_bookings?: { id: string; title: string; status: BookingStatus; start_at: string | null; end_at: string | null }[];
  /** a customer's reported problem: the payout is held until Vendly resolves it */
  dispute_opened_at?: string | null;
  dispute_reason?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolution?: string | null;
  dispute_vendor_reply?: string | null;
  dispute_vendor_replied_at?: string | null;
  /** no_show | late | not_as_described | quality | damage | billing | other */
  dispute_category?: string | null;
  /** full_refund | partial_refund | other */
  dispute_outcome?: string | null;
  dispute_requested_amount?: number | string | null;
  /** short-lived signed links to the customer's photos (on the booking itself, not in lists) */
  dispute_photo_urls?: string[];
  /** inspiration photos sent with the request, as short-lived signed links (on the booking itself) */
  request_photo_urls?: string[];
  /** Refunds tab: refunded to the customer's card, and how much of that the vendor gave back */
  refunded_total?: number;
  given_back?: number;
  /** Rentals: the "listing" is synthesised from the rented items */
  is_rental?: boolean;
  security_deposit?: number | string | null;
  rental_reservations?: { id: string; quantity: number; start_date: string; end_date: string; status: string; item: { id: string; title: string; images?: string[]; dos?: string[] | null; donts?: string[] | null } }[];
  /** what was picked for the package's customizations, frozen when the booking was made */
  customizations?: ChosenCustomization[] | null;
  options_amount?: number | null;
  rental_return?: { damage_fee: number | string; late_fee: number | string; notes?: string | null; created_at: string } | null;
  /** the planner event this booking is part of */
  event_bookings?: { event: { id: string; name: string; date?: string | null } }[];
  created_at: string;
  completed_at?: string | null;
  /** the venue on the map (geocoded by the API; null when not found yet) */
  venue_lat?: number | null;
  venue_lng?: number | null;
  /** where it happens: the vendor goes to the venue, or the customer comes to the vendor */
  service_at?: 'CUSTOMER_LOCATION' | 'VENDOR_LOCATION';
  /** the tracker's times: accepted, the vendor's day-of steps, started */
  confirmed_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  checked_in_at?: string | null;
  started_at?: string | null;
  /** on the booking itself, once accepted (and for 3 days after it's done): the other side's number */
  contact_revealed?: boolean;
  contact_phone?: string | null;
  /** customers, packages at the vendor's place, once accepted: where to go */
  vendor_place?: { address: string; lat: number | null; lng: number | null } | null;
  /** vendors: the day-of steps (On my way, Arrived…) are open today */
  steps_open?: boolean;
  listing: {
    id: string;
    title: string;
    price: number;
    images?: string[];
    /** the package's public, city-level place */
    location?: string | null;
    service_at?: 'CUSTOMER_LOCATION' | 'VENDOR_LOCATION';
    /** the vendor's instructions for using the equipment */
    dos?: string[] | null;
    donts?: string[] | null;
  };
  vendor: {
    id: string;
    name: string;
    avatar?: string;
    avatar_url?: string | null;
  };
  customer?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

/** A signed booking request (see ContractsService.bookingPreview). */
export interface CreateBookingData extends BookingFields {
  preview_token: string;
  signature: SignaturePayload;
}

export interface BookingListParams {
  status?: BookingStatus;
  /** vendor list only: refunds (money went back) or complaints (a problem was reported, open first) */
  filter?: 'refunds' | 'complaints';
  page?: number;
  limit?: number;
}

export interface CheckoutResponse {
  success: boolean;
  url?: string;
  data?: any;
}

export const BookingService = {
  /** With inspiration photos the request goes as multipart: the JSON in `request`, the files in `photos`. */
  createBooking: (data: CreateBookingData, photos: { uri: string; name: string; type: string }[] = []) => {
    if (!photos.length) return api.post<{ success: boolean; data: Booking }>('/bookings', data);
    const form = new FormData();
    form.append('request', JSON.stringify(data));
    photos.forEach((p) => form.append('photos', p as any));
    return api.post<{ success: boolean; data: Booking }>('/bookings/with-photos', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },

  getMyBookingsAsCustomer: (params?: BookingListParams) =>
    api.get<{ success: boolean; data: Booking[]; meta?: any }>('/bookings/my/customer', { params }),

  getMyBookingsAsVendor: (params?: BookingListParams) =>
    api.get<{ success: boolean; data: Booking[]; meta?: any }>('/bookings/my/vendor', { params }),

  getBooking: (id: string) =>
    api.get<{ success: boolean; data: Booking }>(`/bookings/${id}`),

  /** Accept & Sign: the vendor's countersignature confirms the booking. */
  confirmBooking: (id: string, signature?: SignaturePayload) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/confirm`, signature ? { signature } : {}),

  rejectBooking: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/reject`),

  // ─── Suggested changes to a request (vendor suggests, customer approves or declines) ──────────

  /** The suggestion on a request, and for the vendor what the editor starts from. */
  changes: (id: string) => api.get(`/bookings/${id}/changes`),
  /** Vendor: the new total and the updated contract to sign. */
  previewChanges: (id: string, body: Record<string, unknown>) => api.post(`/bookings/${id}/changes/preview`, body),
  sendChanges: (id: string, body: Record<string, unknown>, signature: SignaturePayload) => api.post(`/bookings/${id}/changes`, { ...body, signature }),
  withdrawChanges: (id: string) => api.post(`/bookings/${id}/changes/withdraw`),
  /** Customer: approve and sign the suggested changes. */
  approveChanges: (id: string, signature: SignaturePayload) => api.post(`/bookings/${id}/changes/approve`, { signature }),
  declineChanges: (id: string, reason?: string) => api.post(`/bookings/${id}/changes/decline`, reason ? { reason } : {}),

  startWork: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/start`),

  completeBooking: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/complete`),

  /** The vendor's day-of steps: on my way, arrived (at the customer's), the customer arrived (at the vendor's). */
  trackerStep: (id: string, step: 'en-route' | 'arrived' | 'check-in') =>
    api.post<{ success: boolean; data: Booking }>(`/bookings/${id}/${step}`),

  cancelBooking: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/cancel`),

  createCheckout: (id: string) =>
    api.post<CheckoutResponse>(`/bookings/${id}/checkout`),

  getProofs: (id: string) =>
    api.get<{ success: boolean; data: any[] }>(`/bookings/${id}/proof`),

  uploadProof: (id: string, photoUris: { uri: string; name: string; type: string }[], notes?: string) => {
    const form = new FormData();
    photoUris.forEach((p) => form.append('photos', p as any));
    if (notes) form.append('notes', notes);
    return api.post(`/bookings/${id}/proof`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getDeliverables: (id: string) =>
    api.get<{ success: boolean; data: any[] }>(`/bookings/${id}/deliverables`),

  sendDeliverable: (
    id: string,
    data: { title: string; message?: string; links?: string[] },
  ) => api.post(`/bookings/${id}/deliverables`, data),

  /** Vendor's side of an open dispute, read by Vendly. */
  replyToDispute: (id: string, reply: string) => api.post(`/bookings/${id}/dispute/reply`, { reply }),
};
