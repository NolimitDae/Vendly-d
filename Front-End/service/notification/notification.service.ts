import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

/** The account's switches for optional pushes and emails (Back-end notification-prefs.ts). */
export type NotificationPrefKey = "booking_updates" | "messages" | "payments" | "reminders" | "review_requests" | "email";
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const NotificationService = {
  getNotifications: async () => Fetch.get("/notifications", authHeaders()),

  markAsRead: async (id: string) =>
    Fetch.post(`/notifications/${id}/read`, {}, authHeaders()),

  markAllAsRead: async () =>
    Fetch.post("/notifications/read-all", {}, authHeaders()),

  deleteNotification: async (id: string) =>
    Fetch.delete(`/notifications/${id}`, authHeaders()),

  getPrefs: async () => Fetch.get("/auth/notification-prefs", authHeaders()),

  /** Only the switches sent change. */
  updatePrefs: async (changes: Partial<NotificationPrefs>) =>
    Fetch.patch("/auth/notification-prefs", changes, authHeaders()),
};
