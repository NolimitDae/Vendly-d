import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { CalendarSyncService, type CalendarSyncInfo } from '../../services/calendarSync.service';
import type { VendorProfileStackParams } from '../../navigation/types';
import { apiMessage } from '../auth/SignIn';

type Busy = 'regenerate' | 'connect' | 'sync' | 'remove' | null;

const when = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM, h:mm a') : 'never');

/**
 * Two-way calendar sync: a private feed of Vendly bookings for Google / Apple Calendar, and busy time
 * imported from the vendor's own calendar so those days can't be booked.
 */
export default function CalendarSync() {
  const nav = useNavigation<NativeStackNavigationProp<VendorProfileStackParams>>();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<CalendarSyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [url, setUrl] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await CalendarSyncService.get();
      if (res.data?.success) setInfo(res.data.data);
    } catch (err) {
      Alert.alert('Calendar sync', apiMessage(err, 'Could not load calendar sync. Try again in a moment.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (kind: Exclude<Busy, null>, call: () => Promise<{ data: { success: boolean; data: CalendarSyncInfo } }>) => {
    setBusy(kind);
    try {
      const res = await call();
      if (!res.data?.success) throw new Error();
      setInfo(res.data.data);
      return res.data.data;
    } catch (err) {
      Alert.alert('Calendar sync', apiMessage(err, 'Something went wrong. Try again in a moment.'));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (info?.feed_url) Share.share({ message: info.feed_url }).catch(() => undefined);
  };
  // iOS offers to subscribe when it opens a webcal:// link
  const subscribeHere = () => {
    if (info?.feed_url) Linking.openURL(info.feed_url.replace(/^https?:\/\//, 'webcal://')).catch(share);
  };

  const regenerate = () =>
    Alert.alert('Get a new link?', 'Calendars using the old link stop updating until you add the new one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New link', onPress: () => run('regenerate', CalendarSyncService.regenerateFeed) },
    ]);

  const connect = async () => {
    if (!url.trim()) return Alert.alert('Paste your calendar link', "Copy your calendar's iCal address and paste it here.");
    const next = await run('connect', () => CalendarSyncService.setImport(url.trim()));
    if (next) {
      setUrl('');
      Alert.alert('Calendar connected', `${next.import.busy_count} busy ${next.import.busy_count === 1 ? 'time' : 'times'} imported. Those days can't be booked now.`);
    }
  };

  const remove = () =>
    Alert.alert('Stop importing?', 'Dates your calendar blocked become bookable again.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run('remove', CalendarSyncService.removeImport) },
    ]);

  const imp = info?.import;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <ScreenHeader title="Calendar sync" onBack={() => nav.goBack()} />
        {loading ? (
          <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
        ) : !info ? (
          <Text style={[s.muted, { textAlign: 'center', paddingHorizontal: 20 }]}>Calendar sync isn't available right now.</Text>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 20 }}>
            <View style={s.note}>
              <Ionicons name="information-circle-outline" size={16} color={DARK.accent} />
              <Text style={s.noteText}>Avoid double bookings: see Vendly bookings in your calendar, and block days you're busy elsewhere.</Text>
            </View>

            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>Show bookings in your calendar</Text>
              <Text style={s.muted}>Confirmed and pending bookings plus your blocked dates. Keep this link private: anyone with it can see your schedule.</Text>
              <View style={s.linkBox}>
                <Text style={s.linkText} selectable numberOfLines={2}>{info.feed_url}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable style={s.outline} onPress={regenerate} disabled={busy === 'regenerate'} accessibilityRole="button">
                  {busy === 'regenerate' ? <ActivityIndicator color={DARK.accent} /> : <Text style={s.outlineText}>New link</Text>}
                </Pressable>
                <GradientButton title="Share link" onPress={share} style={{ flex: 1.5 }} />
              </View>
              {Platform.OS === 'ios' && (
                <Pressable onPress={subscribeHere} accessibilityRole="button" hitSlop={6}>
                  <Text style={s.link}>Add to Calendar on this iPhone</Text>
                </Pressable>
              )}
              <View style={{ gap: 6 }}>
                <Text style={s.step}><Text style={s.bold}>Google Calendar:</Text> on a computer, Settings → Add calendar → From URL, then paste the link.</Text>
                <Text style={s.step}><Text style={s.bold}>iPhone:</Text> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, then paste the link.</Text>
                <Text style={s.step}><Text style={s.bold}>Mac:</Text> Calendar → File → New Calendar Subscription.</Text>
              </View>
            </Card>

            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>Block days you're busy</Text>
              {imp?.connected ? (
                <>
                  <View style={s.row}>
                    <Ionicons name="link-outline" size={18} color={DARK.accent} />
                    <Text style={s.body}>{imp.url_hint}</Text>
                  </View>
                  <Text style={s.muted}>Last synced: {when(imp.last_synced_at)} · {imp.busy_count} upcoming busy {imp.busy_count === 1 ? 'time' : 'times'}</Text>
                  {!!imp.last_sync_error && (
                    <View style={s.error} accessibilityRole="alert">
                      <Ionicons name="warning-outline" size={18} color="#F7B1B8" />
                      <Text style={s.errorText}>The last sync ({when(imp.last_sync_attempt_at)}) failed: {imp.last_sync_error} Dates from the last good sync stay blocked.</Text>
                    </View>
                  )}
                  <Text style={s.muted}>Busy days in the next 12 months can't be booked on any of your packages. It re-syncs every hour; customers never see what the event is.</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable style={s.outline} onPress={remove} disabled={busy === 'remove'} accessibilityRole="button">
                      {busy === 'remove' ? <ActivityIndicator color={DARK.accent} /> : <Text style={s.outlineText}>Remove</Text>}
                    </Pressable>
                    <GradientButton title="Sync now" onPress={() => run('sync', CalendarSyncService.syncNow)} loading={busy === 'sync'} style={{ flex: 1.5 }} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.muted}>Paste your calendar's iCal address. Busy days in the next 12 months can't be booked; customers never see what the event is.</Text>
                  <View style={ui.field}>
                    <TextInput
                      style={ui.input}
                      placeholder="https://calendar.google.com/…/basic.ics"
                      placeholderTextColor={DARK.muted}
                      value={url}
                      onChangeText={setUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      accessibilityLabel="Calendar iCal address"
                    />
                  </View>
                  <GradientButton title="Connect calendar" onPress={connect} loading={busy === 'connect'} />
                  <View style={{ gap: 6 }}>
                    <Text style={s.step}><Text style={s.bold}>Google:</Text> on a computer, Settings → your calendar → Integrate calendar → copy "Secret address in iCal format".</Text>
                    <Text style={s.step}><Text style={s.bold}>iCloud:</Text> in Calendar, share the calendar, turn on Public Calendar and copy the link.</Text>
                  </View>
                </>
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: DARK.card },
  noteText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  h2: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  body: { flex: 1, color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  step: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
  bold: { color: '#fff', fontFamily: FONTS.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkBox: { borderRadius: 12, backgroundColor: DARK.field, padding: 12 },
  linkText: { color: '#fff', fontSize: 12, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#3A1424' },
  errorText: { flex: 1, color: '#F7B1B8', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
