import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const MarketplaceService = {
  searchListings: async (params: {
    q?: string;
    category_id?: string;
    sub_category_id?: string;
    location?: string;
    min_price?: number;
    max_price?: number;
    page?: number;
    limit?: number;
    sort?: string;
  }) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") query.set(k, String(v));
    });
    return Fetch.get(`/marketplace/listings?${query.toString()}`);
  },

  getFeaturedListings: async () => Fetch.get("/marketplace/listings/featured"),

  getListing: async (id: string) => Fetch.get(`/marketplace/listings/${id}`),

  getVendorProfile: async (vendorId: string) =>
    Fetch.get(`/marketplace/vendors/${vendorId}`),

  getCategories: async () => Fetch.get("/marketplace/categories"),
};
