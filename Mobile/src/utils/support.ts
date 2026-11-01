import { Alert, Linking } from 'react-native';

/** Where customers reach Vendly (the API sends Contact us messages to the same inbox, SUPPORT_EMAIL). */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@vendlymarketplace.com';

/** Opens an email to support; without a mail app, shows the address to write to. */
export function contactSupport(subject = 'Help with Vendly') {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => Alert.alert('Contact support', `Email us at ${SUPPORT_EMAIL} and we'll get back to you within 1–2 business days.`));
}
