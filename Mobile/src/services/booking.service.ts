import { api } from './api';
import type { BookingFields, SignaturePayload } from './contracts.service';

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Booking {
  id: string;
  status: BookingStatus;
  scheduled_at?: string;
  message?: string;
  amount?: number;
  service_fee?: number | string | null;
  paid_at?: string | null;
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
