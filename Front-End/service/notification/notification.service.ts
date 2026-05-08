import { CookieHelper } from "../../helper/cookie.helper";
import { Fetch } from "../../lib/Fetch";

const authHeaders = () => ({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${CookieHelper.get({ key: "token" })}`,
  },
});

export const NotificationService = {
  getNotifications: async () => Fetch.get("/notifications", authHeaders()),

  markAsRead: async (id: string) =>
    Fetch.post(`/notifications/${id}/read`, {}, authHeaders()),

  markAllAsRead: async () =>
    Fetch.post("/notifications/read-all", {}, authHeaders()),

  deleteNotification: async (id: string) =>
    Fetch.delete(`/notifications/${id}`, authHeaders()),
};
