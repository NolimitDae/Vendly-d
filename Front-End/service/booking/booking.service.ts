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

  uploadProof: async (id: string, photos: File[], notes?: string) => {
    const form = new FormData();
    photos.forEach((p) => form.append("photos", p));
    if (notes) form.append("notes", notes);
    return Fetch.post(`/bookings/${id}/proof`, form, {
      headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
    });
  },

  getProofs: async (id: string) =>
    Fetch.get(`/bookings/${id}/proof`, authHeaders()),

  sendDeliverable: async (
    id: string,
    data: { title: string; message?: string; links?: string[]; files?: File[] },
  ) => {
    const form = new FormData();
    form.append("title", data.title);
    if (data.message) form.append("message", data.message);
    if (data.links?.length) form.append("links", JSON.stringify(data.links));
    (data.files ?? []).forEach((f) => form.append("files", f));
    return Fetch.post(`/bookings/${id}/deliverables`, form, {
      headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
    });
  },

  getDeliverables: async (id: string) =>
    Fetch.get(`/bookings/${id}/deliverables`, authHeaders()),
};
