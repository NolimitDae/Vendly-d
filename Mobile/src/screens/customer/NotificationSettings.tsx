import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { LOCAL_PREFS_KEY, NotificationPrefKey, NotificationPrefs, NotificationsService } from '../../services/notifications.service';
import { apiMessage } from '../auth/SignIn';

// saved on the account, so the website and the server see the same choices
type AccountPref = { key: NotificationPrefKey; title: string; body: string };
const TOPICS: AccountPref[] = [
  { key: 'booking_updates', title: 'Booking updates', body: 'New requests, confirmations, changes and cancellations' },
  { key: 'messages', title: 'Messages', body: 'New quotes and chat invites' },
  { key: 'payments', title: 'Invoice and payment', body: 'Payment problems and money back' },
  { key: 'reminders', title: 'Reminders', body: 'Requests and add-ons waiting for your answer' },
  { key: 'review_requests', title: 'Review requests', body: 'A quick ask to rate a booking once it’s done' },
];
const EMAIL: AccountPref = { key: 'email', title: 'Email', body: 'Get these updates by email as well' };
const ALL_ON: NotificationPrefs = { booking_updates: true, messages: true, payments: true, reminders: true, review_requests: true, email: true };
// older versions kept these on the phone only, under the same storage key
const LEGACY_KEYS: Record<string, NotificationPrefKey> = { booking: 'booking_updates', messages: 'messages', payments: 'payments', email: 'email' };

/** Moves switches saved on this phone by older versions to the account once, then keeps only the sound switch here. */
async function migrateLocal(): Promise<{ sound: boolean; changes: Partial<NotificationPrefs> }> {
  const raw = await AsyncStorage.getItem(LOCAL_PREFS_KEY).catch(() => null);
  const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  const changes: Partial<NotificationPrefs> = {};
  for (const [old, key] of Object.entries(LEGACY_KEYS)) if (saved[old] === false) changes[key] = false;
  return { sound: saved.sound !== false, changes };
}

export default function NotificationSettings({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPrefs>(ALL_ON);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [sound, setSound] = useState(true);
  const [pushAllowed, setPushAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const local = await migrateLocal().catch(() => ({ sound: true, changes: {} }));
      setSound(local.sound);
      const res = Object.keys(local.changes).length ? await NotificationsService.updatePrefs(local.changes) : await NotificationsService.getPrefs();
      if (!res.data?.success) throw new Error();
      setPrefs({ ...ALL_ON, ...res.data.data });
      setState('ready');
      // saved on the account now: only the sound switch stays on the phone
      AsyncStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ sound: local.sound })).catch(() => {});
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    load();
    if (Platform.OS !== 'web') Notifications.getPermissionsAsync().then((p) => setPushAllowed(p.status === 'granted')).catch(() => setPushAllowed(false));
  }, [load]);

  const toggle = (key: NotificationPrefKey) => (value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    NotificationsService.updatePrefs({ [key]: value })
      .then((res) => {
        if (!res.data?.success) throw new Error();
      })
      .catch((err) => {
        setPrefs((p) => ({ ...p, [key]: !value }));
        Alert.alert('Could not save', apiMessage(err, 'Check your connection and try again.'));
      });
  };

  const toggleSound = (value: boolean) => {
    setSound(value);
    AsyncStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ sound: value })).catch(() => {});
  };

  const accountRow = (p: AccountPref) => ({ ...p, value: prefs[p.key], onChange: toggle(p.key), disabled: state !== 'ready' });
  const rows = [
    ...TOPICS.map(accountRow),
    // this phone only
    { key: 'sound', title: 'In-app sound', body: 'Play a sound for new notifications while the app is open', value: sound, onChange: toggleSound, disabled: false },
    accountRow(EMAIL),
  ];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 8 }}>
        <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
        {pushAllowed === false && (
          <Pressable style={s.banner} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={s.bannerText}>Push notifications are off for Vendly on this phone. Tap to open Settings and turn them on.</Text>
          </Pressable>
        )}
        {state === 'failed' && (
          <Pressable style={s.banner} onPress={load} accessibilityRole="button">
            <Text style={s.bannerText}>We couldn’t load your settings. Tap to try again.</Text>
          </Pressable>
        )}
        <View style={{ paddingHorizontal: 20 }}>
          {rows.map((p) => (
            <View key={p.key} style={s.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.title}>{p.title}</Text>
                <Text style={s.body}>{p.body}</Text>
              </View>
              <Switch
                value={p.value}
                onValueChange={p.onChange}
                disabled={p.disabled}
                trackColor={{ false: DARK.field, true: '#A84AB0' }}
                thumbColor="#fff"
                accessibilityLabel={p.title}
              />
            </View>
          ))}
          <Text style={s.note}>Security and receipts are always sent.</Text>
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
  note: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular, marginTop: 16 },
});
