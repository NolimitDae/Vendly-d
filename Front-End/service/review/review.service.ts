import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export interface PendingReview {
  booking_id: string;
  completed_at: string;
  listing: { id: string; title: string; image: string | null } | null;
  vendor: { id: string; name: string; avatar_url: string | null };
}

export interface VendorReview {
  id: string;
  rating: number;
  comment?: string | null;
  reply?: string | null;
  created_at: string;
  updated_at?: string;
  author: { id: string; name: string | null; avatar_url: string | null } | null;
  listing: { id: string; title: string } | null;
}

export interface VendorReviewsMeta {
  total: number;
  page: number;
  limit: number;
  last_page: number;
  avg_rating: number | null;
  unanswered: number;
  distribution?: Record<number, number>;
}

export const ReviewService = {
  /** The signed-in vendor's own reviews, with the average, count and how many need a reply. */
  mine: async (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/reviews/my?${query.toString()}`, authHeaders());
  },

  /** Finished bookings waiting for a rating, for the "how was it?" prompt. */
  pending: async () => Fetch.get("/reviews/pending", authHeaders()),
  /** "Not now": stop asking about this booking. */
  dismiss: async (bookingId: string) => Fetch.post(`/reviews/pending/${bookingId}/dismiss`, {}, authHeaders()),

  create: async (data: { booking_id: string; rating: number; comment?: string }) =>
    Fetch.post("/reviews", data, authHeaders()),

  reply: async (reviewId: string, reply: string) =>
    Fetch.patch(`/reviews/${reviewId}/reply`, { reply }, authHeaders()),

  getListingReviews: async (listingId: string, params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/reviews/listing/${listingId}?${query.toString()}`);
  },

  getVendorReviews: async (vendorId: string, params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/reviews/vendor/${vendorId}?${query.toString()}`);
  },
};
