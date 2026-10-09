import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const auth = () => ({
  headers: { Authorization: `Bearer ${CookieHelper.get({ key: "token" })}` },
});

export interface SignaturePayload {
  legal_name: string;
  consent: boolean;
  content_sha256: string;
  signature_image?: string;
  use_saved_signature?: boolean;
  save_signature?: boolean;
  device_platform?: string;
}

export interface BookingFields {
  listing_id: string;
  vendor_id: string;
  scheduled_at?: string;
  event_start_at?: string;
  event_end_at?: string;
  venue_address?: string;
  guest_count?: number;
  message?: string;
  event_id?: string;
  timezone?: string;
}

export interface AmendmentChanges {
  scheduled_at?: string;
  event_start_at?: string;
  event_end_at?: string;
  venue_address?: string;
  guest_count?: number;
  amount?: number;
  cancellation_policy?: string;
}

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

/** Nest errors arrive as { message } or { message: { message } }; validation errors as arrays. */
export function apiError(err: any, fallback = "Something went wrong") {
  const m = err?.response?.data?.message;
  const inner = typeof m === "object" && m !== null ? m.message : m;
  if (Array.isArray(inner)) return inner.join(" ");
  return inner || fallback;
}

export const ContractsService = {
  templates: () => Fetch.get("/contracts/templates", auth()),
  bookingPreview: (data: BookingFields) => Fetch.post("/contracts/booking-preview", data, auth()),
  forBooking: (bookingId: string) => Fetch.get(`/contracts/booking/${bookingId}`, auth()),
  get: (id: string) => Fetch.get(`/contracts/${id}`, auth()),
  downloadLink: (id: string, kind: "executed" | "source" | "draft" = "executed") =>
    Fetch.get(`/contracts/${id}/download?kind=${kind}`, auth()),
  sign: (id: string, signature: SignaturePayload) => Fetch.post(`/contracts/${id}/sign`, { signature }, auth()),
  decline: (id: string) => Fetch.post(`/contracts/${id}/decline`, {}, auth()),
  amendmentPreview: (bookingId: string, changes: AmendmentChanges) =>
    Fetch.post(`/contracts/booking/${bookingId}/amendments/preview`, { changes, timezone: browserTimezone() }, auth()),
  requestAmendment: (bookingId: string, changes: AmendmentChanges, signature: SignaturePayload) =>
    Fetch.post(`/contracts/booking/${bookingId}/amendments`, { changes, signature, timezone: browserTimezone() }, auth()),
  eventContracts: (eventId: string) => Fetch.get(`/contracts/event/${eventId}`, auth()),
  eventZip: (eventId: string) => Fetch.get(`/contracts/event/${eventId}/zip`, auth()),
  verifyCode: (code: string) => Fetch.get(`/contracts/verify/${encodeURIComponent(code)}`),
  verifyFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return Fetch.post("/contracts/verify", form);
  },

  // vendor setup
  vendorList: () => Fetch.get("/vendor/contracts", auth()),
  vendorPreview: (dto: any) => Fetch.post("/vendor/contracts/preview", dto, auth()),
  vendorCreateDefault: (dto: any) => Fetch.post("/vendor/contracts/default", dto, auth()),
  vendorReplaceDefault: (id: string, dto: any) => Fetch.put(`/vendor/contracts/${id}/default`, dto, auth()),
  vendorUseDefault: () => Fetch.post("/vendor/contracts/use-default", {}, auth()),
  vendorUpload: (form: FormData) => Fetch.post("/vendor/contracts/upload", form, auth()),
  vendorReplaceUpload: (id: string, form: FormData) => Fetch.put(`/vendor/contracts/${id}/upload`, form, auth()),
  vendorArchive: (id: string) => Fetch.patch(`/vendor/contracts/${id}/archive`, {}, auth()),
  vendorFile: (id: string) => Fetch.get(`/vendor/contracts/${id}/file`, auth()),

  // admin
  adminTemplates: () => Fetch.get("/admin/contracts/templates", auth()),
  adminCreateTemplate: (dto: { category: string; title: string; body: string; required_fields?: string[] }) =>
    Fetch.post("/admin/contracts/templates", dto, auth()),
  adminActivateTemplate: (id: string) => Fetch.patch(`/admin/contracts/templates/${id}/activate`, {}, auth()),
  adminRetireTemplate: (id: string) => Fetch.patch(`/admin/contracts/templates/${id}/retire`, {}, auth()),
  adminVendorContracts: (params: { type?: string; status?: string; page?: number }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, String(v)));
    return Fetch.get(`/admin/contracts/vendor-contracts?${q.toString()}`, auth());
  },
  adminVendorFile: (id: string) => Fetch.get(`/admin/contracts/vendor-contracts/${id}/file`, auth()),
  adminDisable: (id: string, reason: string) =>
    Fetch.post(`/admin/contracts/vendor-contracts/${id}/disable`, { reason }, auth()),
  adminBooking: (bookingId: string) => Fetch.get(`/admin/contracts/bookings/${bookingId}`, auth()),
};

/** Opens a short-lived signed file link in a new tab. */
export async function openContractFile(getLink: () => Promise<any>) {
  const res = await getLink();
  const url = res.data?.data?.url;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
