import { Platform, Share } from 'react-native';
import { haptic } from './haptics';

// Shared links open on the website (and its link previews show the photo and name); set
// EXPO_PUBLIC_WEB_URL in the EAS environment to change it.
const WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://vendlymarketplace.com').replace(/\/+$/, '');

export const listingLink = (id: string) => `${WEB}/marketplace/${encodeURIComponent(id)}`;
/** A vendor's shop: vendlymarketplace.com/v/<handle>, or their id when they have no handle yet. */
export const vendorLink = (v: { id: string; handle?: string | null }) => `${WEB}/v/${encodeURIComponent(v.handle || v.id)}`;

/** Opens the phone's share sheet (Messages, WhatsApp, Instagram, copy...) with a short line and the link. */
export async function shareLink(text: string, url: string) {
  haptic.tap();
  try {
    // iOS shares the link as a link (with a preview); Android takes it as part of the message
    await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` });
  } catch {
    // closing the sheet or no app to share to: nothing to do
  }
}
