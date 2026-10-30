import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const json = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

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

export const VendorPromosService = {
  list: () => Fetch.get("/vendor/promos", json()),
  create: (data: VendorPromoInput) => Fetch.post("/vendor/promos", data, json()),
  update: (id: string, data: Partial<VendorPromoInput>) => Fetch.patch(`/vendor/promos/${id}`, data, json()),
  /** Turns the code off (bookings that used it keep it). */
  remove: (id: string) => Fetch.delete(`/vendor/promos/${id}`, json()),
};
