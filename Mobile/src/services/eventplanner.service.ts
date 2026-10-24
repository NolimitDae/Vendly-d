import { api } from './api';

export interface EventPlannerProfile {
  id: string;
  user_id: string;
  business_name?: string;
  bio?: string;
  website?: string;
  instagram?: string;
  portfolio: string[];
  event_types: string[];
  years_experience?: number;
  team_size?: number;
  license_status: 'PENDING' | 'APPROVED' | 'NOT_APPLICABLE' | 'SUSPENDED';
}

/** A verified planner's public profile (the same one the website shows). */
export interface PublicPlannerProfile extends EventPlannerProfile {
  user?: { id: string; name: string; avatar_url?: string | null };
}

export const EventPlannerService = {
  /** Public: only verified planners are found. */
  getPublicProfile: (userId: string) =>
    api.get<{ success: boolean; data: PublicPlannerProfile }>(`/event-planner/planners/${userId}`),

  getMyProfile: () =>
    api.get<{ success: boolean; data: EventPlannerProfile }>('/event-planner/profile/me'),

  upsertProfile: (data: {
    business_name?: string;
    bio?: string;
    website?: string;
    instagram?: string;
    years_experience?: number;
    team_size?: number;
    event_types?: string[];
  }) => api.post('/event-planner/profile', data),
};

export const AuthService = {
  me: () =>
    api.get<{ success: boolean; data: { id: string; name: string; email: string; type: string; avatar_url?: string } }>(
      '/auth/me',
    ),
};
