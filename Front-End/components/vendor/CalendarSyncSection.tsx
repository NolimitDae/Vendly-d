"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AlertTriangle, CalendarDays, Check, Copy, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { CalendarSyncInfo, CalendarSyncService } from "@/service/vendor/calendar-sync.service";

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

type Busy = "regenerate" | "connect" | "sync" | "remove" | null;

/**
 * Two-way calendar sync for vendors: a private feed of Vendly bookings for Google / Apple Calendar,
 * and busy time imported from their own calendar so those days can't be booked.
 */
export default function CalendarSyncSection() {
  const [info, setInfo] = useState<CalendarSyncInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [importUrl, setImportUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    CalendarSyncService.get()
      .then((res) => (res.data?.success ? setInfo(res.data.data) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const run = async (kind: Exclude<Busy, null>, call: () => Promise<any>, done?: string) => {
    setBusy(kind);
    try {
      const res = await call();
      if (!res.data?.success) throw new Error(res.data?.message);
      setInfo(res.data.data);
      if (done) toast.success(done);
      return res.data.data as CalendarSyncInfo;
    } catch (e) {
      toast.error(apiMessage(e, "Something went wrong. Please try again."));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!info?.feed_url) return;
    try {
      await navigator.clipboard.writeText(info.feed_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  const regenerate = () => {
    if (!confirm("Get a new link? Calendars using the old one stop updating until you add the new link.")) return;
    run("regenerate", CalendarSyncService.regenerateFeed, "New calendar link created");
  };

  const connect = async () => {
    const url = importUrl.trim();
    if (!url) return toast.error("Paste your calendar's iCal address first.");
    const next = await run("connect", () => CalendarSyncService.setImport(url));
    if (next) {
      setImportUrl("");
      toast.success(`Calendar connected. ${next.import.busy_count} busy ${next.import.busy_count === 1 ? "time" : "times"} imported.`);
    }
  };

  const syncNow = async () => {
    const next = await run("sync", CalendarSyncService.syncNow);
    if (next && !next.import.last_sync_error) toast.success("Calendar synced");
  };

  const remove = () => {
    if (!confirm("Stop importing this calendar? Dates it blocked become bookable again.")) return;
    run("remove", CalendarSyncService.removeImport, "Calendar removed");
  };

  if (failed && !info) return null;

  const imp = info?.import;

  return (
    <section aria-labelledby="calendar-sync-title" className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 id="calendar-sync-title" className="font-semibold text-gray-900 dark:text-white">Calendar sync</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Avoid double bookings: see Vendly bookings in your calendar, and block days you're busy elsewhere.</p>
        </div>
      </div>

      {!info ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading calendar sync" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {/* Vendly → their calendar */}
          <div className="p-6 space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-white">Show Vendly bookings in your calendar</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Confirmed and pending bookings plus your blocked dates. Keep this link private: anyone with it can see your schedule.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                aria-label="Your calendar feed link"
                value={info.feed_url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-200 font-mono"
              />
              <button
                type="button"
                onClick={copy}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={busy === "regenerate"}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-60"
              >
                {busy === "regenerate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                New link
              </button>
            </div>
            <details className="text-sm text-gray-600 dark:text-gray-300">
              <summary className="cursor-pointer text-primary font-medium">How to add it</summary>
              <ul className="mt-2 space-y-1.5 list-disc pl-5">
                <li>
                  <strong>Google Calendar:</strong> on a computer, open Settings → Add calendar → From URL, paste the link and click Add calendar.
                  Google refreshes it every few hours.
                </li>
                <li>
                  <strong>Apple Calendar (Mac):</strong> File → New Calendar Subscription, paste the link, then set Auto-refresh to every hour.
                </li>
                <li>
                  <strong>iPhone / iPad:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste the link.
                </li>
              </ul>
            </details>
          </div>

          {/* their calendar → Vendly */}
          <div className="p-6 space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-white">Block dates when your own calendar is busy</h3>
            {imp?.connected ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-primary" />
                    {imp.url_hint}
                  </span>
                  <span>Last synced: {when(imp.last_synced_at)}</span>
                  <span>
                    {imp.busy_count} upcoming busy {imp.busy_count === 1 ? "time" : "times"}
                  </span>
                </div>
                {imp.last_sync_error && (
                  <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      The last sync ({when(imp.last_sync_attempt_at)}) failed: {imp.last_sync_error} Dates from the last good sync stay blocked.
                    </span>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Busy days in the next 12 months can't be booked on any of your packages. It re-syncs every hour; customers never see what the event is.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={syncNow}
                    disabled={busy === "sync"}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sync now
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy === "remove"}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60"
                  >
                    {busy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Paste your calendar's iCal address. Busy days in the next 12 months can't be booked on any of your packages; customers never see what the event is.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    aria-label="Calendar iCal address"
                    placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && connect()}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={connect}
                    disabled={busy === "connect"}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Connect calendar
                  </button>
                </div>
                <details className="text-sm text-gray-600 dark:text-gray-300">
                  <summary className="cursor-pointer text-primary font-medium">Where do I find it?</summary>
                  <ul className="mt-2 space-y-1.5 list-disc pl-5">
                    <li>
                      <strong>Google Calendar:</strong> Settings → pick your calendar under "Settings for my calendars" → Integrate calendar → copy
                      "Secret address in iCal format".
                    </li>
                    <li>
                      <strong>Apple iCloud:</strong> in the Calendar app, share the calendar, turn on Public Calendar and copy the link (webcal:// links work).
                    </li>
                  </ul>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
