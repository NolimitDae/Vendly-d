import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, PUSH_TOKEN_KEY } from './api';

/** Settings kept on this phone only: the in-app sound switch (and, from older versions, all of them). */
export const LOCAL_PREFS_KEY = 'vendly_notification_prefs';

/** The account's switches for optional pushes and emails, saved on the server (Back-end notification-prefs.ts). */
export type NotificationPrefKey = 'booking_updates' | 'messages' | 'payments' | 'reminders' | 'review_requests' | 'email';
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

async function soundOn(): Promise<boolean> {
  try {
    const saved = await AsyncStorage.getItem(LOCAL_PREFS_KEY);
    return saved ? JSON.parse(saved).sound !== false : true;
  } catch {
    return true;
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // the "In-app sound" switch, for notifications that arrive while the app is open
    shouldPlaySound: await soundOn(),
    shouldSetBadge: true,
  }),
});

export const NotificationsService = {
  async requestPermissions(): Promise<boolean> {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  async registerPushToken(): Promise<string | null> {
    const granted = await NotificationsService.requestPermissions();
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  },

  async savePushToken(token: string): Promise<void> {
    await api.post('/auth/push-token', { token, platform: Platform.OS });
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => undefined);
  },

  getPrefs: () => api.get<{ success: boolean; data: NotificationPrefs }>('/auth/notification-prefs'),
  /** Only the switches sent change. */
  updatePrefs: (changes: Partial<NotificationPrefs>) =>
    api.patch<{ success: boolean; data: NotificationPrefs }>('/auth/notification-prefs', changes),

  async scheduleLocal(title: string, body: string, secondsFromNow = 0): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger:
        secondsFromNow > 0
          ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondsFromNow }
          : null,
    });
  },

  addNotificationListener(
    handler: (notification: Notifications.Notification) => void,
  ) {
    return Notifications.addNotificationReceivedListener(handler);
  },

  addResponseListener(
    handler: (response: Notifications.NotificationResponse) => void,
  ) {
    return Notifications.addNotificationResponseReceivedListener(handler);
  },
};
