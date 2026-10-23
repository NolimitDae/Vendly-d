import { api } from './api';
import type { BookingFields, SignaturePayload } from './contracts.service';

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
  payment_plan?: string | null;
  early_released_amount?: number | string | null;
  /** Rentals: the "listing" is synthesised from the rented items */
  is_rental?: boolean;
  security_deposit?: number | string | null;
  rental_reservations?: { id: string; quantity: number; start_date: string; end_date: string; status: string; item: { id: string; title: string; images?: string[] } }[];
  rental_return?: { damage_fee: number | string; late_fee: number | string; notes?: string | null; created_at: string } | null;
  /** the planner event this booking is part of */
  event_bookings?: { event: { id: string; name: string; date?: string | null } }[];
  created_at: string;
  listing: {
    id: string;
    title: string;
    price: number;
    images?: string[];
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
  page?: number;
  limit?: number;
}

export interface CheckoutResponse {
  success: boolean;
  url?: string;
  data?: any;
}

export const BookingService = {
  createBooking: (data: CreateBookingData) =>
    api.post<{ success: boolean; data: Booking }>('/bookings', data),

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

  startWork: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/start`),

  completeBooking: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/complete`),

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
};
