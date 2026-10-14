import { api } from './api';

export type EventRole = 'planner' | 'vendor' | 'client';

export interface TimelineItem {
  id: string;
  starts_at: string;
  ends_at?: string | null;
  title: string;
  notes?: string | null;
  location?: string | null;
  vendor_id?: string | null;
  vendor?: { id: string; name: string } | null;
  done: boolean;
}

export interface EventFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  created_at: string;
  uploader: { id: string; name: string };
  can_delete: boolean;
  url: string;
}

export interface EventOverview {
  id: string;
  name: string;
  date?: string | null;
  venue?: string | null;
  role: EventRole;
  planner: { id: string; name: string } | null;
  client_sees_budget: boolean;
  vendors: { booking_id: string; status: string; vendor: { id: string; name: string }; service: string; starts_at?: string | null; total?: number }[];
  timeline: TimelineItem[];
  file_count: number;
}

export interface BudgetSummary {
  total_budget: number | null;
  allocated: number;
  committed: number;
  spent: number;
  remaining: number | null;
  over_budget: boolean;
  can_edit: boolean;
  lines: { id: string; category: string; allocated: number; spent: number; committed: number; note: string | null; booking: { id: string; status: string; vendor_name: string; title: string } | null }[];
  unassigned_bookings: { id: string; vendor_name: string; title: string; total: number; paid: number; status: string }[];
}

export interface VendorTeam {
  id: string;
  name: string;
  vendor_ids: string[];
  vendors: { id: string; name: string }[];
}

type Res<T> = { success: boolean; data: T };

export const EventToolsService = {
  overview: (eventId: string) => api.get<Res<EventOverview>>(`/events/${eventId}/overview`),
  shared: () => api.get<Res<{ id: string; name: string; date?: string | null; venue?: string | null; status: string; event_planner: { id: string; name: string } }[]>>('/client/events'),
  setClient: (eventId: string, body: { email?: string | null; sees_budget?: boolean }) => api.patch(`/events/${eventId}/client`, body),

  timeline: (eventId: string) => api.get<Res<TimelineItem[]>>(`/events/${eventId}/timeline`),
  addTimeline: (eventId: string, body: { starts_at: string; ends_at?: string; title: string; notes?: string; location?: string; vendor_id?: string }) => api.post<Res<TimelineItem>>(`/events/${eventId}/timeline`, body),
  updateTimeline: (eventId: string, itemId: string, body: Partial<TimelineItem>) => api.patch<Res<TimelineItem>>(`/events/${eventId}/timeline/${itemId}`, body),
  deleteTimeline: (eventId: string, itemId: string) => api.delete(`/events/${eventId}/timeline/${itemId}`),

  files: (eventId: string) => api.get<Res<EventFile[]>>(`/events/${eventId}/files`),
  upload: (eventId: string, files: { uri: string; name: string; type: string }[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f as unknown as Blob));
    return api.post(`/events/${eventId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteFile: (eventId: string, fileId: string) => api.delete(`/events/${eventId}/files/${fileId}`),

  budget: (eventId: string) => api.get<Res<BudgetSummary>>(`/events/${eventId}/budget-summary`),

  teams: () => api.get<Res<VendorTeam[]>>('/vendor-teams'),
  saveTeam: (body: { name: string; vendor_ids: string[] }, id?: string) => (id ? api.patch(`/vendor-teams/${id}`, body) : api.post('/vendor-teams', body)),
  deleteTeam: (id: string) => api.delete(`/vendor-teams/${id}`),
  inviteTeam: (eventId: string, teamId: string, note?: string) => api.post<Res<{ invited: number }>>(`/events/${eventId}/invite-team`, { team_id: teamId, note }),
};

export const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
