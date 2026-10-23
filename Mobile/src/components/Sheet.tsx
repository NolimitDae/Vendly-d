import React from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';

/**
 * Bottom sheet in the AddCardSheet style: dimmed backdrop (tap to close), handle, title, and a scrolling
 * body that rides up with the keyboard. `footer` stays pinned under the scroll area.
 */
export default function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.overlay}>
          {/* the backdrop is a sibling, not a wrapper, so VoiceOver still reaches each control in the sheet */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (Keyboard.isVisible() ? Keyboard.dismiss() : onClose())}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.handle} />
            <Text style={s.title} accessibilityRole="header">{title}</Text>
            {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 16, paddingBottom: 4 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: DARK.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingTop: 12, gap: 14 },
  handle: { alignSelf: 'center', width: 60, height: 5, borderRadius: 3, backgroundColor: DARK.muted, marginBottom: 6 },
  title: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  subtitle: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, marginTop: -6 },
});

/** Tick box row used in sheets and lists: 44pt tall, whole row tappable. */
export function CheckRow({
  checked,
  onPress,
  title,
  subtitle,
  right,
  disabled,
}: {
  checked: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [c.row, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? DARK.accent : DARK.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={c.title} numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={c.sub} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

const c = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  sub: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
});
