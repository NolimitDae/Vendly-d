import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const ReviewService = {
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
