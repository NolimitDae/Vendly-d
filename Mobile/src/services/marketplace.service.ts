import { api } from './api';

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  images: string[];
  avg_rating?: number;
  _count?: { reviews: number };
  category?: { id: string; name: string };
  vendor: { id: string; name: string; avatar_url?: string };
}

export const MarketplaceService = {
  search: (params?: {
    q?: string;
    category_id?: string;
    min_price?: number;
    max_price?: number;
    sort?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => v != null && q.set(k, String(v)));
    }
    return api.get<{ success: boolean; data: Listing[]; meta: any }>(
      `/marketplace/search${q.toString() ? '?' + q.toString() : ''}`,
    );
  },

  getCategories: () =>
    api.get<{ success: boolean; data: { id: string; name: string }[] }>(
      '/marketplace/categories',
    ),

  getListing: (id: string) =>
    api.get<{ success: boolean; data: Listing }>(`/marketplace/listings/${id}`),
};

export const BookingService = {
  create: (data: {
    listing_id: string;
    vendor_id: string;
    scheduled_at?: string;
    message?: string;
  }) => api.post<{ success: boolean; data: { id: string } }>('/bookings', data),
};
