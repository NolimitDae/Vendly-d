import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
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
    await api.post('/users/push-token', { token, platform: Platform.OS });
  },

  async scheduleLocal(title: string, body: string, secondsFromNow = 0): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: secondsFromNow > 0 ? { seconds: secondsFromNow } : null,
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
