import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { NotificationsService } from '../services/notifications.service';

export function usePushNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    NotificationsService.registerPushToken().then(async (token) => {
      if (!token) return;
      setPushToken(token);
      try {
        await NotificationsService.savePushToken(token);
      } catch {
        // non-fatal — backend may not support push tokens yet
      }
    });

    notificationListener.current = NotificationsService.addNotificationListener(
      (n) => setNotification(n),
    );

    responseListener.current = NotificationsService.addResponseListener(
      (_response) => {
        // navigate to relevant screen based on response.notification.request.content.data
      },
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { pushToken, notification };
}
