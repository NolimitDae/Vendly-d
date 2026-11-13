import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { needsAccount } from '../context/guest';
import ReportSheet from './chat/ReportSheet';

/**
 * "Report" on a vendor page, a package or a review (App Store guideline 1.2: anyone can flag what others
 * post). Goes to Vendly's report queue with what it was about; the person can also be blocked.
 */
export default function ReportButton({
  person,
  about,
  title,
  variant = 'icon',
  style,
}: {
  person: { id: string; name: string } | null | undefined;
  about: string;
  title: string;
  variant?: 'icon' | 'text';
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // nothing to report about your own page
  if (!person?.id || person.id === user?.id) return null;
  const press = () => {
    if (needsAccount('report this')) return;
    setOpen(true);
  };
  return (
    <>
      {variant === 'icon' ? (
        <Pressable onPress={press} style={[s.icon, style]} accessibilityRole="button" accessibilityLabel={title} hitSlop={6}>
          <Ionicons name="flag-outline" size={19} color={DARK.bg} />
        </Pressable>
      ) : (
        <Pressable onPress={press} style={[s.text, style]} accessibilityRole="button" accessibilityLabel={title} hitSlop={8}>
          <Ionicons name="flag-outline" size={14} color={DARK.muted} />
          <Text style={s.textLabel}>Report</Text>
        </Pressable>
      )}
      <ReportSheet visible={open} person={person} about={about} title={title} onClose={() => setOpen(false)} onReported={() => undefined} />
    </>
  );
}

const s = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  text: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  textLabel: { color: DARK.muted, fontFamily: FONTS.medium, fontSize: 13 },
});
