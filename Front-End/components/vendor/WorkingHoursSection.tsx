"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Clock, Loader2 } from "lucide-react";
import { AuthService } from "@/service/auth/auth.service";
import {
  CLOSE_STEPS,
  DAY_KEYS,
  DAY_NAMES,
  DEFAULT_WEEK,
  TIME_STEPS,
  deviceTimeZone,
  formatTime,
  hoursProblem,
  minutesOf,
  summariseHours,
  withDeviceZone,
  zoneLabel,
  type DayKey,
  type WorkingHours,
} from "@/lib/working-hours";

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

const selectCls =
  "px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";

/**
 * Weekly working hours: a row per day with an Open switch and open / close times. Customers can only
 * request bookings that start on an open day and fit inside that day's hours. With no hours set,
 * any day and time can be requested.
 */
export default function WorkingHoursSection() {
  const [loaded, setLoaded] = useState(false);
  // what's saved (null = not set) and what's being edited
  const [saved, setSaved] = useState<WorkingHours | null>(null);
  const [week, setWeek] = useState<WorkingHours>(DEFAULT_WEEK);
  // remembers a day's times while it's switched off, so switching it back on restores them
  const [lastTimes, setLastTimes] = useState<Partial<Record<DayKey, { open: string; close: string }>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AuthService.me()
      .then((res) => {
        const hours: WorkingHours | null = res.data?.data?.working_hours ?? null;
        setSaved(hours);
        if (hours) setWeek(hours);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setDay = (day: DayKey, value: WorkingHours[DayKey]) => setWeek((w) => ({ ...w, [day]: value }));

  const toggle = (day: DayKey, open: boolean) => {
    const current = week[day];
    if (!open && current) setLastTimes((t) => ({ ...t, [day]: current }));
    setDay(day, open ? lastTimes[day] ?? { open: "09:00", close: "17:00" } : null);
  };

  const setTime = (day: DayKey, which: "open" | "close", value: string) => {
    const current = week[day];
    if (!current) return;
    const next = { ...current, [which]: value };
    // keep the close after the open when the opening time moves past it
    if (which === "open" && minutesOf(next.close) <= minutesOf(value)) {
      next.close = CLOSE_STEPS.find((t) => minutesOf(t) > minutesOf(value)) ?? "24:00";
    }
    setDay(day, next);
  };

  const save = async (week: WorkingHours | null) => {
    if (week) {
      const problem = hoursProblem(week);
      if (problem) return void toast.error(problem);
    }
    // the times are this device's wall-clock times: the zone goes with them
    const hours = week ? withDeviceZone(week) : null;
    setBusy(true);
    try {
      const res = await AuthService.updateWorkingHours(hours);
      if (!res.data?.success) throw new Error(res.data?.message);
      setSaved(hours);
      if (!hours) setWeek(DEFAULT_WEEK);
      toast.success(hours ? "Working hours saved" : "Working hours removed. Customers can request any day and time.");
    } catch (e) {
      toast.error(apiMessage(e, (e as Error)?.message || "Couldn't save your working hours"));
    } finally {
      setBusy(false);
    }
  };

  // also true when the saved hours have no zone yet, or another one than this device's
  const changed = JSON.stringify(saved) !== JSON.stringify(withDeviceZone(week));
  const zone = deviceTimeZone();

  return (
    <section aria-labelledby="working-hours-title" className="mt-10 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 id="working-hours-title" className="font-semibold text-gray-900 dark:text-white">Working hours</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Customers can only request bookings on your open days, inside these hours{zone ? ` (${zoneLabel(zone)})` : ""}. Customers in other time zones see them in yours.
          </p>
        </div>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading working hours" />
        </div>
      ) : (
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
            {saved ? <>Now: <span className="font-medium">{summariseHours(saved)}</span></> : "Not set: customers can request any day and time."}
          </p>

          <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-100 dark:border-gray-700">
            {DAY_KEYS.map((day) => {
              const h = week[day];
              const name = DAY_NAMES[day];
              return (
                <li key={day} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <label className="flex items-center gap-2 w-36 text-sm font-medium text-gray-900 dark:text-white">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={!!h}
                      checked={!!h}
                      onChange={(e) => toggle(day, e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      aria-label={`Open on ${name}`}
                    />
                    {name}
                  </label>
                  {h ? (
                    <div className="flex items-center gap-2">
                      <select aria-label={`${name} opens`} value={h.open} onChange={(e) => setTime(day, "open", e.target.value)} className={selectCls}>
                        {TIME_STEPS.map((t) => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                      <span className="text-sm text-gray-500">to</span>
                      <select aria-label={`${name} closes`} value={h.close} onChange={(e) => setTime(day, "close", e.target.value)} className={selectCls}>
                        {CLOSE_STEPS.filter((t) => minutesOf(t) > minutesOf(h.open)).map((t) => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500 dark:text-gray-400">Closed</span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save(week)}
              disabled={busy || (!changed && !!saved)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60 flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Save working hours
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => confirm("Remove your working hours? Customers will be able to request any day and time.") && save(null)}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-60"
              >
                Remove hours
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
