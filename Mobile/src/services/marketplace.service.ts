import { api } from './api';

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  images: string[];
  location?: string | null;
  /** set when searching near a point */
  distance_miles?: number | null;
  delivery_time?: number | null;
  tags?: string[];
  avg_rating?: number | null;
  review_count?: number;
  _count?: { reviews: number; bookings?: number };
  category?: { id: string; name: string } | null;
  sub_category?: { id: string; name: string } | null;
  vendor: {
    id: string;
    name: string;
    avatar_url?: string | null;
    created_at?: string;
    vendorProfile?: { business_name?: string | null; about_me?: string | null; license_status?: string } | null;
  };
  reviews?: { id: string; rating: number; comment?: string | null; created_at: string; author?: { id: string; name: string; avatar_url?: string | null } | null }[];
}

export interface Category {
  id: string;
  name: string;
  sub_categories?: { id: string; name: string }[];
  _count?: { vendor_listings: number };
}

export interface VendorProfile {
  id: string;
  name: string;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
  created_at: string;
  vendorProfile?: { business_name?: string | null; about_me?: string | null; license_status?: string } | null;
  vendorListings: Listing[];
  avg_rating?: number | null;
  _count?: { vendorListings: number; receivedReviews: number };
}

export interface SearchParams {
  q?: string;
  category_id?: string;
  sub_category_id?: string;
  location?: string;
  min_price?: number;
  max_price?: number;
  sort?: 'rating' | 'price_asc' | 'price_desc' | 'newest' | 'distance';
  near_lat?: number;
  near_lng?: number;
  radius_miles?: number;
  /** yyyy-MM-dd: leave out packages the vendor blocked that day */
  date?: string;
  min_rating?: number;
  page?: number;
  limit?: number;
}

export const vendorName = (v?: Listing['vendor'] | null) => v?.vendorProfile?.business_name || v?.name || '';

export const MarketplaceService = {
  // The API has no /marketplace/search; listings takes the same filters.
  search: (params?: SearchParams) =>
    api.get<{ success: boolean; data: Listing[]; meta: any }>('/marketplace/listings', { params }),

  getCategories: () => api.get<{ success: boolean; data: Category[] }>('/marketplace/categories'),

  getListing: (id: string) => api.get<{ success: boolean; data: Listing }>(`/marketplace/listings/${id}`),

  getVendor: (id: string) => api.get<{ success: boolean; data: VendorProfile }>(`/marketplace/vendors/${id}`),

  getBlockedDates: (listingId: string) =>
    api.get<{ success: boolean; data: { id: string; start_date: string; end_date: string; reason?: string | null }[] }>(
      `/marketplace/listings/${listingId}/availability`,
    ),

  savedIds: () => api.get<{ success: boolean; data: string[] }>('/saved-listings/ids'),
  save: (listingId: string) => api.post(`/saved-listings/${listingId}`),
  unsave: (listingId: string) => api.delete(`/saved-listings/${listingId}`),
};
