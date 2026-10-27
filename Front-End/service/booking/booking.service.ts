import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";
import type { BookingFields, SignaturePayload } from "../contracts/contracts.service";

export type CustomerBookingTab = "active" | "upcoming" | "pending" | "complete";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const BookingService = {
  /** Sends a signed booking request (see ContractsService.bookingPreview), with any inspiration photos. */
  create: async (data: BookingFields & { preview_token: string; signature: SignaturePayload }, photos: File[] = []) => {
    if (!photos.length) return Fetch.post("/bookings", data, authHeaders());
    // the request has nested fields, so it travels as JSON next to the files
    const form = new FormData();
    form.append("request", JSON.stringify(data));
    photos.forEach((p) => form.append("photos", p));
    return Fetch.post("/bookings/with-photos", form, {
      headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
    });
  },

  /** `tab`: pending (waiting for the vendor), upcoming (confirmed), active (in progress or happening now), complete (done, cancelled, declined, expired). */
  getMyAsCustomer: async (params?: { page?: number; limit?: number; status?: string; tab?: CustomerBookingTab }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/bookings/my/customer?${query.toString()}`, authHeaders());
  },

  /** `filter`: "refunds" (money went back to the customer) or "complaints" (a problem was reported, open first). */
  getMyAsVendor: async (params?: { page?: number; limit?: number; status?: string; filter?: "refunds" | "complaints" }) => {
    const query = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => v && query.set(k, String(v)));
    return Fetch.get(`/bookings/my/vendor?${query.toString()}`, authHeaders());
  },

  getOne: async (id: string) => Fetch.get(`/bookings/${id}`, authHeaders()),

  /** Accept & Sign: the vendor's countersignature confirms the booking. */
  confirm: async (id: string, signature?: SignaturePayload) =>
    Fetch.patch(`/bookings/${id}/confirm`, signature ? { signature } : {}, authHeaders()),

  reject: async (id: string, reason?: string) =>
    Fetch.patch(`/bookings/${id}/reject`, { reason }, authHeaders()),

  startWork: async (id: string) =>
    Fetch.patch(`/bookings/${id}/start`, {}, authHeaders()),

  complete: async (id: string) =>
    Fetch.patch(`/bookings/${id}/complete`, {}, authHeaders()),

  /** The vendor's day-of steps: on my way, arrived (at the customer's), the customer arrived (at the vendor's). */
  trackerStep: async (id: string, step: "en-route" | "arrived" | "check-in") =>
    Fetch.post(`/bookings/${id}/${step}`, {}, authHeaders()),

  /** `reason_code`: one of the reasons the cancel preview lists; `note` is optional and the other side sees it. */
  cancel: async (id: string, body: { reason_code?: string; note?: string } = {}) =>
    Fetch.patch(`/bookings/${id}/cancel`, body, authHeaders()),

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

  // ─── Suggested changes to a request (vendor suggests, customer approves or declines) ──────────

  /** The suggestion on a request, and for the vendor what the editor starts from. */
  changes: async (id: string) => Fetch.get(`/bookings/${id}/changes`, authHeaders()),

  /** Vendor: the new total and the updated contract to sign, for the terms in `body`. */
  previewChanges: async (id: string, body: Record<string, unknown>) =>
    Fetch.post(`/bookings/${id}/changes/preview`, body, authHeaders()),

  /** Vendor: sign and send the suggestion. */
  sendChanges: async (id: string, body: Record<string, unknown>, signature: SignaturePayload) =>
    Fetch.post(`/bookings/${id}/changes`, { ...body, signature }, authHeaders()),

  withdrawChanges: async (id: string) => Fetch.post(`/bookings/${id}/changes/withdraw`, {}, authHeaders()),

  /** Customer: approve and sign the suggested changes. */
  approveChanges: async (id: string, signature: SignaturePayload) =>
    Fetch.post(`/bookings/${id}/changes/approve`, { signature }, authHeaders()),

  declineChanges: async (id: string, reason?: string) =>
    Fetch.post(`/bookings/${id}/changes/decline`, reason ? { reason } : {}, authHeaders()),

  // ─── Custom payment plan on a confirmed booking (vendor proposes, customer signs or declines) ──

  /** The booking's payments, the plan waiting (or last answered), and for the vendor the editor's rules. */
  paymentPlan: async (id: string) => Fetch.get(`/bookings/${id}/payment-plan`, authHeaders()),

  /** Vendor: check a plan and get the amendment to sign. */
  previewPaymentPlan: async (id: string, body: Record<string, unknown>) =>
    Fetch.post(`/bookings/${id}/payment-plan/preview`, body, authHeaders()),

  proposePaymentPlan: async (id: string, body: Record<string, unknown>, signature: SignaturePayload) =>
    Fetch.post(`/bookings/${id}/payment-plan`, { ...body, signature }, authHeaders()),

  withdrawPaymentPlan: async (id: string) => Fetch.post(`/bookings/${id}/payment-plan/withdraw`, {}, authHeaders()),

  /** Customer: sign to agree to the plan. */
  approvePaymentPlan: async (id: string, signature: SignaturePayload) =>
    Fetch.post(`/bookings/${id}/payment-plan/approve`, { signature }, authHeaders()),

  declinePaymentPlan: async (id: string, reason?: string) =>
    Fetch.post(`/bookings/${id}/payment-plan/decline`, reason ? { reason } : {}, authHeaders()),

  /** Vendor's side of an open dispute, read by Vendly. */
  replyToDispute: async (id: string, reply: string) =>
    Fetch.post(`/bookings/${id}/dispute/reply`, { reply }, authHeaders()),
};
