import { api } from './api';

export type SwitchableRole = 'CUSTOMER' | 'VENDOR' | 'EVENT_PLANNER';
export type IdStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RolesInfo {
  active: SwitchableRole | null;
  roles: SwitchableRole[];
  available: SwitchableRole[];
  id_verification: { verified: boolean; status: IdStatus; rejection_reason: string | null; submitted_at: string | null };
}

export const ROLE_LABEL: Record<SwitchableRole, string> = { CUSTOMER: 'Customer', VENDOR: 'Vendor', EVENT_PLANNER: 'Event planner' };
export const ROLE_BLURB: Record<SwitchableRole, string> = {
  CUSTOMER: 'Find and book vendors for your events.',
  VENDOR: 'List your services and take bookings.',
  EVENT_PLANNER: 'Plan events for clients and book vendors for them.',
};

/** One login, several roles, and the ID check that unlocks switching. */
export const IdentityService = {
  roles: () => api.get<{ success: boolean; data: RolesInfo }>('/auth/roles'),
  switchRole: (role: SwitchableRole, business_name?: string) =>
    api.post('/auth/roles/switch', { role, ...(business_name ? { business_name } : {}) }),
  status: () => api.get('/identity/me'),
  /** multipart: document_type, legal_name, front, back (not for passports), selfie */
  submit: (form: FormData) => api.post('/identity', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }),
};
