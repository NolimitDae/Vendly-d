import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';

export interface SignaturePayload {
  legal_name: string;
  consent: boolean;
  content_sha256: string;
  signature_image?: string;
  use_saved_signature?: boolean;
  save_signature?: boolean;
  device_platform?: string;
  app_version?: string;
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

export const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

/** Device details recorded with each signature. */
export const signerDevice = () => ({
  device_platform: Platform.OS,
  app_version: Constants.expoConfig?.version ?? undefined,
});

export function apiError(err: any, fallback = 'Something went wrong') {
  const m = err?.response?.data?.message;
  const inner = typeof m === 'object' && m !== null ? m.message : m;
  if (Array.isArray(inner)) return inner.join(' ');
  return inner || fallback;
}

export const ContractsService = {
  templates: () => api.get('/contracts/templates'),
  bookingPreview: (data: BookingFields) => api.post('/contracts/booking-preview', data),
  forBooking: (bookingId: string) => api.get(`/contracts/booking/${bookingId}`),
  get: (id: string) => api.get(`/contracts/${id}`),
  downloadLink: (id: string, kind: 'executed' | 'source' | 'draft' = 'executed') =>
    api.get(`/contracts/${id}/download`, { params: { kind } }),
  sign: (id: string, signature: SignaturePayload) => api.post(`/contracts/${id}/sign`, { signature }),
  decline: (id: string) => api.post(`/contracts/${id}/decline`),
  amendmentPreview: (bookingId: string, changes: AmendmentChanges) =>
    api.post(`/contracts/booking/${bookingId}/amendments/preview`, { changes, timezone: deviceTimezone() }),
  requestAmendment: (bookingId: string, changes: AmendmentChanges, signature: SignaturePayload) =>
    api.post(`/contracts/booking/${bookingId}/amendments`, { changes, signature, timezone: deviceTimezone() }),
  eventContracts: (eventId: string) => api.get(`/contracts/event/${eventId}`),
  eventZip: (eventId: string) => api.get(`/contracts/event/${eventId}/zip`),

  vendorList: () => api.get('/vendor/contracts'),
  vendorPreview: (dto: any) => api.post('/vendor/contracts/preview', dto),
  vendorCreateDefault: (dto: any) => api.post('/vendor/contracts/default', dto),
  vendorReplaceDefault: (id: string, dto: any) => api.put(`/vendor/contracts/${id}/default`, dto),
  vendorUseDefault: () => api.post('/vendor/contracts/use-default'),
  vendorUpload: (form: FormData) =>
    api.post('/vendor/contracts/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }),
  vendorArchive: (id: string) => api.patch(`/vendor/contracts/${id}/archive`),
  vendorFile: (id: string) => api.get(`/vendor/contracts/${id}/file`),
};

/** Opens a short-lived signed file link in the system PDF viewer / browser. */
export async function openSignedLink(getLink: () => Promise<any>) {
  const res = await getLink();
  const url = res.data?.data?.url;
  if (url) await Linking.openURL(url);
}
