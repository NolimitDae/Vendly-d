import { useNotificationContext } from "@/providers/NotificationProvider";

export function useNotifications() {
  return useNotificationContext();
}
