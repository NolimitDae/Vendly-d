import { api } from './api';
import type { AuthUser } from './auth.service';

export interface VendorProfile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  bio?: string;
  type: string;
  avg_rating?: number;
  review_count?: number;
  listings?: any[];
}

export const UserService = {
  getMe: () =>
    api.get<{ success: boolean; data: AuthUser }>('/auth/me'),

  updateProfile: (data: Partial<AuthUser>) =>
    api.patch<{ success: boolean; data: AuthUser }>('/auth/update', data),

  getVendorProfile: (vendorId: string) =>
    api.get<{ success: boolean; data: VendorProfile }>(`/marketplace/vendors/${vendorId}`),
};
