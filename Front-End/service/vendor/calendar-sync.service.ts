import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

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

export const CalendarSyncService = {
  get: async () => Fetch.get("/vendor/calendar-sync", authHeaders()),

  regenerateFeed: async () => Fetch.post("/vendor/calendar-sync/feed/regenerate", {}, authHeaders()),

  setImport: async (url: string) => Fetch.put("/vendor/calendar-sync/import", { url }, authHeaders()),

  syncNow: async () => Fetch.post("/vendor/calendar-sync/import/sync", {}, authHeaders()),

  removeImport: async () => Fetch.delete("/vendor/calendar-sync/import", authHeaders()),
};
