import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Light touch feedback. Web has no haptics, and a failure here must never break a tap.
const on = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  /** primary buttons */
  tap: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  /** chips, toggles, picking a date */
  select: () => on && Haptics.selectionAsync().catch(() => {}),
  /** a booking sent, a payment made */
  success: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  /** something needs attention */
  warning: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
