import { api } from './api';

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

export interface CreateBookingData {
  listing_id: string;
  vendor_id: string;
  scheduled_at?: string;
  message?: string;
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

  confirmBooking: (id: string) =>
    api.patch<{ success: boolean; data: Booking }>(`/bookings/${id}/confirm`),

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
};
