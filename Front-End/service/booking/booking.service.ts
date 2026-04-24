import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const BookingService = {
  create: async (data: {
    listing_id: string;
    vendor_id: string;
    scheduled_at?: string;
    message?: string;
  }) => Fetch.post("/bookings", data, authHeaders()),

  getMyAsCustomer: async (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/bookings/my/customer?${query.toString()}`, authHeaders());
  },

  getMyAsVendor: async (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/bookings/my/vendor?${query.toString()}`, authHeaders());
  },

  getOne: async (id: string) => Fetch.get(`/bookings/${id}`, authHeaders()),

  confirm: async (id: string) =>
    Fetch.patch(`/bookings/${id}/confirm`, {}, authHeaders()),

  reject: async (id: string, reason?: string) =>
    Fetch.patch(`/bookings/${id}/reject`, { reason }, authHeaders()),

  startWork: async (id: string) =>
    Fetch.patch(`/bookings/${id}/start`, {}, authHeaders()),

  complete: async (id: string) =>
    Fetch.patch(`/bookings/${id}/complete`, {}, authHeaders()),

  cancel: async (id: string, reason?: string) =>
    Fetch.patch(`/bookings/${id}/cancel`, { reason }, authHeaders()),

  createCheckout: async (id: string) =>
    Fetch.post(`/bookings/${id}/checkout`, {}, authHeaders()),
};
