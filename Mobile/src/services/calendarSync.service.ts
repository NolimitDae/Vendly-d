import { api } from './api';

export interface CalendarSyncInfo {
  /** Private .ics address for Google / Apple Calendar */
  feed_url: string | null;
  import: {
    connected: boolean;
    /** Host of the imported calendar; the secret part is never sent back */
    url_hint: string | null;
    last_synced_at: string | null;
    last_sync_attempt_at: string | null;
    last_sync_error: string | null;
    busy_count: number;
  };
}

type Res = { success: boolean; data: CalendarSyncInfo };

export const CalendarSyncService = {
  get: () => api.get<Res>('/vendor/calendar-sync'),
  regenerateFeed: () => api.post<Res>('/vendor/calendar-sync/feed/regenerate'),
  // the server fetches the calendar before answering, so allow a little longer than usual
  setImport: (url: string) => api.put<Res>('/vendor/calendar-sync/import', { url }, { timeout: 30000 }),
  syncNow: () => api.post<Res>('/vendor/calendar-sync/import/sync', undefined, { timeout: 30000 }),
  removeImport: () => api.delete<Res>('/vendor/calendar-sync/import'),
};
