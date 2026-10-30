import { api } from './api';

/** A vendor's own promo code: only for their packages (all, or the ones in listing_ids). */
export interface VendorPromo {
  id: string;
  code: string;
  description?: string | null;
  percent_off?: number | string | null;
  amount_off?: number | string | null;
  min_amount?: number | string | null;
  max_uses?: number | null;
  uses: number;
  expires_at?: string | null;
  active: boolean;
  once_per_customer: boolean;
  first_booking_only: boolean;
  listing_ids: string[];
}

export interface VendorPromoInput {
  code: string;
  description?: string;
  percent_off?: number | null;
  amount_off?: number | null;
  min_amount?: number | null;
  max_uses?: number | null;
  expires_at?: string | null;
  active?: boolean;
  once_per_customer?: boolean;
  first_booking_only?: boolean;
  listing_ids?: string[];
}

export const PromosService = {
  list: () => api.get<{ success: boolean; data: VendorPromo[] }>('/vendor/promos'),
  create: (data: VendorPromoInput) => api.post('/vendor/promos', data),
  update: (id: string, data: Partial<VendorPromoInput>) => api.patch(`/vendor/promos/${id}`, data),
};
