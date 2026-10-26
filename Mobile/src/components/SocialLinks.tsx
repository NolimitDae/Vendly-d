import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK } from '../constants/colors';
import { haptic } from '../utils/haptics';

export type SocialKey = 'website' | 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'x';
export type SocialLinksData = Partial<Record<SocialKey, string | null>>;

/** The social accounts a vendor can add, in the order they're shown. */
export const SOCIALS: { key: SocialKey; label: string; placeholder: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'website', label: 'Website', placeholder: 'yourbusiness.com', icon: 'globe-outline' },
  { key: 'instagram', label: 'Instagram', placeholder: '@yourbusiness', icon: 'logo-instagram' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@yourbusiness', icon: 'logo-tiktok' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/yourbusiness', icon: 'logo-facebook' },
  { key: 'youtube', label: 'YouTube', placeholder: '@yourbusiness', icon: 'logo-youtube' },
  { key: 'x', label: 'X', placeholder: '@yourbusiness', icon: 'logo-x' },
];

/** A vendor's social accounts as round icon buttons that open the link; nothing when none are set. */
export default function SocialLinks({ socials }: { socials?: SocialLinksData | null }) {
  // the server only stores https links; anything else is skipped rather than opened
  const items = SOCIALS.filter(({ key }) => socials?.[key]?.startsWith('https://'));
  if (!items.length) return null;
  return (
    <View style={s.row}>
      {items.map(({ key, label, icon }) => (
        <Pressable
          key={key}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            haptic.tap();
            Linking.openURL(socials![key]!).catch(() => {});
          }}
          hitSlop={4}
          accessibilityRole="link"
          accessibilityLabel={label}
        >
          <Ionicons name={icon} size={18} color="#fff" />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: DARK.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
