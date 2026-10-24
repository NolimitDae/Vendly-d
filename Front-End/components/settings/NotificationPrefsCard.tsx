"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Bell, Loader2 } from "lucide-react";
import { NotificationPrefKey, NotificationPrefs, NotificationService } from "@/service/notification/notification.service";
import { cn } from "@/lib/utils";

// the same switches as the app's Notifications screen
const ROWS: { key: NotificationPrefKey; title: string; body: string }[] = [
  { key: "booking_updates", title: "Booking updates", body: "New requests, confirmations, changes and cancellations" },
  { key: "messages", title: "Messages", body: "New quotes and chat invites" },
  { key: "payments", title: "Invoice and payment", body: "Payment problems and money back" },
  { key: "reminders", title: "Reminders", body: "Requests and add-ons waiting for your answer" },
  { key: "review_requests", title: "Review requests", body: "A quick ask to rate a booking once it's done" },
  { key: "email", title: "Email", body: "Get these updates by email as well" },
];

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

/** Which optional app notifications and emails this account gets. Saved on the server, so the app shows the same. */
export default function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    NotificationService.getPrefs()
      .then((res) => {
        if (!res.data?.success) throw new Error();
        setPrefs(res.data.data);
      })
      .catch(() => setFailed(true));
  }, []);

  const toggle = (key: NotificationPrefKey, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    NotificationService.updatePrefs({ [key]: value })
      .then((res) => {
        if (!res.data?.success) throw new Error(res.data?.message);
      })
      .catch((e) => {
        setPrefs((p) => (p ? { ...p, [key]: !value } : p));
        toast.error(apiMessage(e, "Couldn't save your notification settings. Please try again."));
      });
  };

  return (
    <div id="notifications" className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden scroll-mt-24">
      <div className="flex items-center gap-3 p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Notifications</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Choose what we send to the Vendly app and by email.</p>
        </div>
      </div>

      {!prefs ? (
        <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
          {failed ? "We couldn't load your notification settings. Refresh the page to try again." : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading notification settings" />}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {ROWS.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{r.title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{r.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[r.key]}
                aria-label={r.title}
                onClick={() => toggle(r.key, !prefs[r.key])}
                className={cn("w-11 h-6 shrink-0 rounded-full relative transition", prefs[r.key] ? "bg-primary" : "bg-gray-300 dark:bg-gray-600")}
              >
                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", prefs[r.key] ? "left-5" : "left-0.5")} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
        Security and receipts are always sent.
      </p>
    </div>
  );
}
