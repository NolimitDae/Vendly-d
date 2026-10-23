import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useOnboarding } from '../../context/OnboardingContext';
import OnboardingChecklist from '../../components/OnboardingChecklist';

interface Item {
  id: string;
  created_at: string;
  read_at: string | null;
  entity_id: string | null;
  notification_event: { type: string | null; text: string | null } | null;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  booking: 'calendar-outline',
  chat: 'chatbubble-ellipses-outline',
  event: 'sparkles-outline',
  payment: 'card-outline',
};

/** Everything Vendly has told you: bookings, payments, quotes, event updates. */
export default function Inbox() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onboarding = useOnboarding();
  const checklist = onboarding.data?.visible ? onboarding.data : null;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setItems(res.data?.data ?? []);
    } catch {
      setItems((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); void onboarding.refresh(); }, [load, onboarding.refresh]));

  const open = (n: Item) => {
    if (!n.read_at) {
      api.post(`/notifications/${n.id}/read`).catch(() => {});
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? prev);
    }
    const type = n.notification_event?.type;
    const id = n.entity_id;
    if (!id) return;
    if (type === 'booking') {
      nav.navigate('BookingsTab', { screen: user?.type === 'VENDOR' ? 'VendorBookingDetail' : 'BookingDetail', initial: false, params: { bookingId: id } });
    } else if (type === 'chat') {
      nav.navigate('MessagesTab', { screen: 'ChatDetail', initial: false, params: { conversationId: id, participantName: 'Conversation' } });
    } else if (type === 'event') {
      if (user?.type === 'EVENT_PLANNER') nav.navigate('HomeTab', { screen: 'EventDetail', initial: false, params: { eventId: id, eventName: '' } });
      else if (user?.type === 'VENDOR') nav.navigate('BookingsTab', { screen: 'EventShared', initial: false, params: { eventId: id } });
      else nav.navigate('ProfileTab', { screen: 'EventShared', initial: false, params: { eventId: id } });
    }
  };

  const readAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((prev) => prev?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? prev);
  };

  const unread = items?.filter((n) => !n.read_at).length ?? 0;

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader
        title="Notifications"
        onBack={() => nav.goBack()}
        right={unread ? (
          <Pressable onPress={readAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mark all as read">
            <Ionicons name="checkmark-done-outline" size={24} color={DARK.accent} />
          </Pressable>
        ) : undefined}
      />
      {!items ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 20, gap: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); void onboarding.refresh(true); }} tintColor={DARK.accent} />}
          ListHeaderComponent={checklist ? <OnboardingChecklist data={checklist} /> : null}
          ListEmptyComponent={
            checklist ? null : (
              <View style={s.empty}>
                <Ionicons name="notifications-outline" size={42} color={DARK.accent} />
                <Text style={s.emptyTitle}>You’re all caught up</Text>
                <Text style={s.muted}>Booking updates, payments, quotes and event changes show up here.</Text>
              </View>
            )
          }
          renderItem={({ item: n }) => {
            const [title, ...rest] = (n.notification_event?.text ?? '').split(': ');
            const body = rest.join(': ');
            return (
              <Pressable style={[s.row, !n.read_at && s.rowUnread]} onPress={() => open(n)} accessibilityRole="button">
                <View style={s.icon}><Ionicons name={ICONS[n.notification_event?.type ?? ''] ?? 'notifications-outline'} size={20} color={DARK.accent} /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.title, !n.read_at && { color: '#fff' }]} numberOfLines={1}>{body ? title : 'Vendly'}</Text>
                  <Text style={s.body} numberOfLines={2}>{body || title}</Text>
                  <Text style={s.time}>{formatDistanceToNowStrict(parseISO(n.created_at), { addSuffix: true })}</Text>
                </View>
                {!n.read_at && <View style={s.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  empty: { alignItems: 'center', gap: 8, padding: 28, backgroundColor: DARK.card, borderRadius: 18 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: DARK.card, borderRadius: 16, padding: 14 },
  rowUnread: { borderWidth: 1, borderColor: DARK.border },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#E9DDEB', fontSize: 15, fontFamily: FONTS.semibold },
  body: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  time: { color: DARK.muted, fontSize: 11, fontFamily: FONTS.medium, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: DARK.accent, marginTop: 6 },
});
