import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';

const PREFS_KEY = 'vendly_notification_prefs';

// shortcut: preferences are stored on the device only; move them to the API when per-channel settings exist server-side.
const PREFS = [
  { key: 'booking', title: 'Booking updates', body: 'Accepted requests, reminders and changes to your bookings' },
  { key: 'messages', title: 'Messages', body: 'New messages from vendors' },
  { key: 'payments', title: 'Invoice and payment', body: 'Payment due, receipts and refunds' },
  { key: 'sound', title: 'In-app sound', body: 'Play a sound for new notifications while the app is open' },
  { key: 'email', title: 'Email', body: 'Important updates by email as well' },
] as const;

type Prefs = Record<(typeof PREFS)[number]['key'], boolean>;
const DEFAULTS: Prefs = { booking: true, messages: true, payments: true, sound: true, email: true };

export default function NotificationSettings({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [pushAllowed, setPushAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((v) => v && setPrefs({ ...DEFAULTS, ...JSON.parse(v) })).catch(() => {});
    if (Platform.OS !== 'web') Notifications.getPermissionsAsync().then((p) => setPushAllowed(p.status === 'granted')).catch(() => setPushAllowed(false));
  }, []);

  const toggle = (key: keyof Prefs) => (value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 8 }}>
        <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
        {pushAllowed === false && (
          <Pressable style={s.banner} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={s.bannerText}>Push notifications are off for Vendly on this phone. Tap to open Settings and turn them on.</Text>
          </Pressable>
        )}
        <View style={{ paddingHorizontal: 20 }}>
          {PREFS.map((p) => (
            <View key={p.key} style={s.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.title}>{p.title}</Text>
                <Text style={s.body}>{p.body}</Text>
              </View>
              <Switch
                value={prefs[p.key]}
                onValueChange={toggle(p.key)}
                trackColor={{ false: DARK.field, true: '#A84AB0' }}
                thumbColor="#fff"
                accessibilityLabel={p.title}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  banner: { marginHorizontal: 20, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.border },
  bannerText: { color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: DARK.card },
  title: { color: '#fff', fontSize: 18, fontFamily: FONTS.medium },
  body: { color: DARK.muted, fontSize: 15, lineHeight: 22, fontFamily: FONTS.regular },
});
