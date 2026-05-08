"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { CookieHelper } from "@/helper/cookie.helper";
import { NotificationService } from "@/service/notification/notification.service";
import { URL as API_URL } from "@/config/app.config";

export interface AppNotification {
  id: string;
  user_id?: string;
  read_at: string | null;
  created_at: string;
  notification_event: { type: string; text: string };
  sender: { id: string; name: string; avatar?: string | null } | null;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unread: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unread: 0,
  loading: false,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  removeNotification: async () => {},
});

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    const token = CookieHelper.get({ key: "token" });
    if (!token) return;
    setLoading(true);
    try {
      const res = await NotificationService.getNotifications();
      if (res.data?.success) {
        setNotifications(res.data.data ?? []);
        setUnread(res.data.unread ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = CookieHelper.get({ key: "token" });
    if (!token) return;

    const userId = getUserIdFromToken(token);
    if (!userId) return;
    userIdRef.current = userId;

    const sock = io(API_URL, {
      query: { userId },
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = sock;

    sock.on("receiveNotification", (data: any) => {
      const notification: AppNotification = data?.notification ?? data;
      // Filter — backend broadcasts to all; only accept if destined for us
      if (notification.user_id && notification.user_id !== userId) return;
      setNotifications((prev) => [notification, ...prev]);
      setUnread((n) => n + 1);
    });

    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await NotificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await NotificationService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      );
      setUnread(0);
    } catch {
      // silent
    }
  }, []);

  const removeNotification = useCallback(
    async (id: string) => {
      const target = notifications.find((n) => n.id === id);
      try {
        await NotificationService.deleteNotification(id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (!target?.read_at) setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        // silent
      }
    },
    [notifications],
  );

  return (
    <NotificationContext.Provider
      value={{ notifications, unread, loading, markAsRead, markAllAsRead, removeNotification }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}
