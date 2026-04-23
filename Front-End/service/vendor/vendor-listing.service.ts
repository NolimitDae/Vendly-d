import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const VendorListingService = {
  create: async (formData: FormData) =>
    Fetch.post("/vendor/listings", formData, {
      headers: {
        Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
        "Content-Type": "multipart/form-data",
      },
    }),

  getMyListings: async (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/vendor/listings?${query.toString()}`, authHeaders());
  },

  getOne: async (id: string) => Fetch.get(`/vendor/listings/${id}`, authHeaders()),

  update: async (id: string, formData: FormData) =>
    Fetch.patch(`/vendor/listings/${id}`, formData, {
      headers: {
        Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
        "Content-Type": "multipart/form-data",
      },
    }),

  publish: async (id: string) =>
    Fetch.patch(`/vendor/listings/${id}/publish`, {}, authHeaders()),

  remove: async (id: string) =>
    Fetch.delete(`/vendor/listings/${id}`, authHeaders()),
};
