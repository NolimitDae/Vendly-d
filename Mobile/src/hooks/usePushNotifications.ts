import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { NotificationsService } from '../services/notifications.service';
import { navigationRef } from '../navigation/navigationRef';

function openFromNotification(data: Record<string, unknown> | undefined, userType?: string) {
  if (!data || !navigationRef.isReady()) return;

  if (data.type === 'booking' && userType === 'EVENT_PLANNER') {
    navigationRef.navigate('EventsTab');
  } else if (data.type === 'booking' && typeof data.bookingId === 'string') {
    const screen = userType === 'VENDOR' ? 'VendorBookingDetail' : 'BookingDetail';
    navigationRef.navigate('BookingsTab', {
      screen,
      params: { bookingId: data.bookingId },
    });
  } else if (data.type === 'message') {
    navigationRef.navigate('MessagesTab', { screen: 'ChatList' });
  }
}

export function usePushNotifications(userType?: string) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const userTypeRef = useRef(userType);
  userTypeRef.current = userType;

  useEffect(() => {
    if (!userType) return;
    NotificationsService.registerPushToken().then(async (token) => {
      if (!token) return;
      setPushToken(token);
      try {
        await NotificationsService.savePushToken(token);
      } catch {
        // non-fatal
      }
    });
  }, [userType]);

  useEffect(() => {
    notificationListener.current = NotificationsService.addNotificationListener(
      (n) => setNotification(n),
    );

    responseListener.current = NotificationsService.addResponseListener((response) => {
      openFromNotification(response.notification.request.content.data, userTypeRef.current);
    });

    // App launched by tapping a notification while closed
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      setTimeout(
        () => openFromNotification(response.notification.request.content.data, userTypeRef.current),
        500,
      );
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { pushToken, notification };
}
