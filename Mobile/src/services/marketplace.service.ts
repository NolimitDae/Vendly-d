import { api } from './api';
import type { AddOn } from './addons.service';
import type { WorkingHours } from '../utils/workingHours';
import type { SocialLinksData } from '../components/SocialLinks';

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  price_unit: string;
  /** per person / hour / day packages: fewest and most guests, hours or days */
  min_quantity?: number | null;
  max_quantity?: number | null;
  /** extras the customer can pick when booking, in the vendor's order */
  add_ons?: AddOn[];
  /** fees the vendor may request after the service (only with the customer's approval) */
  fees?: AddOn[];
  /** from the vendor's contract for this package */
  cancellation_policy?: { key: string; label: string; text: string } | null;
  /** the payment plan a booking would use (deposit plans keep the deposit when the customer cancels) */
  effective_payment_plan?: string | null;
  /** "What's included" lines, and how many hours ahead it must be booked */
  included_items?: string[] | null;
  min_notice_hours?: number | null;
  /** the vendor's weekly hours (null = any day, any time) and a short line like "Mon–Fri 9am–5pm" */
  working_hours?: WorkingHours | null;
  working_hours_summary?: string | null;
  images: string[];
  location?: string | null;
  /** set when searching near a point */
  distance_miles?: number | null;
  /** how far the vendor travels from `location` */
  service_radius_miles?: number | null;
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
  /** a test vendor's package (Admin → Settings → Test vendors): shown with a "Test" badge */
  is_test?: boolean;
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
  handle?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  bio?: string | null;
  location?: string | null;
  created_at: string;
  vendorProfile?: { business_name?: string | null; about_me?: string | null; license_status?: string } | null;
  vendorListings: Listing[];
  avg_rating?: number | null;
  /** a test vendor (Admin → Settings → Test vendors) */
  is_test?: boolean;
  /** social accounts as full links */
  socials?: SocialLinksData | null;
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
    api.get<{
      success: boolean;
      data: { id: string; start_date: string; end_date: string; reason?: string | null }[];
      /** the vendor's weekly hours (null = any day, any time) */
      working_hours?: WorkingHours | null;
      working_hours_summary?: string | null;
    }>(`/marketplace/listings/${listingId}/availability`),

  savedIds: () => api.get<{ success: boolean; data: string[] }>('/saved-listings/ids'),
  save: (listingId: string) => api.post(`/saved-listings/${listingId}`),
  unsave: (listingId: string) => api.delete(`/saved-listings/${listingId}`),
};
