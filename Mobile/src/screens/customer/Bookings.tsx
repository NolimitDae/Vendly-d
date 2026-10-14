import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { BookingService, type Booking, type BookingStatus } from '../../services/booking.service';
import type { CustomerBookingsStackParams } from '../../navigation/types';

type Tab = 'previous' | 'pending' | 'upcoming';
const TABS: { key: Tab; label: string; statuses: BookingStatus[] }[] = [
  { key: 'previous', label: 'Previous', statuses: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
  { key: 'pending', label: 'Pending', statuses: ['PENDING'] },
  { key: 'upcoming', label: 'Upcoming', statuses: ['CONFIRMED', 'IN_PROGRESS'] },
];

export const bookingWhen = (b: Booking) => {
  const start = b.event_start_at ?? b.scheduled_at;
  if (!start) return 'Date to be confirmed';
  const s = parseISO(start);
  const day = format(s, 'EEE, MMM d');
  if (!b.event_end_at) return `${day}  •  ${format(s, 'h:mm a')}`;
  return `${day}  •  ${format(s, 'h:mm a')} – ${format(parseISO(b.event_end_at), 'h:mm a')}`;
};

export default function CustomerBookings() {
  const nav = useNavigation<NativeStackNavigationProp<CustomerBookingsStackParams>>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [all, setAll] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // One fetch, filtered locally: the API filters by a single status and the tabs group several.
  const load = useCallback(async () => {
    try {
      const res = await BookingService.getMyBookingsAsCustomer({ limit: 100 });
      if (res.data?.success) setAll(res.data.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const current = TABS.find((t) => t.key === tab)!;
  const items = all
    .filter((b) => current.statuses.includes(b.status))
    .sort((a, b) => (a.event_start_at ?? a.scheduled_at ?? a.created_at).localeCompare(b.event_start_at ?? b.scheduled_at ?? b.created_at) * (tab === 'previous' ? -1 : 1));

  const cancel = (b: Booking) =>
    Alert.alert('Cancel booking?', 'The vendor will be told and any payment is refunded under the contract’s cancellation terms.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          try {
            await BookingService.cancelBooking(b.id);
            load();
          } catch (err: any) {
            Alert.alert('Could not cancel', err?.response?.data?.message ?? 'Try again in a moment.');
          }
        },
      },
    ]);

  return (
    <View style={s.root}>
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 32, paddingHorizontal: 20, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 24 }}>
            <Text style={s.title}>Booking</Text>
            <View style={s.segment}>
              {TABS.map((t) => {
                const on = t.key === tab;
                const count = all.filter((b) => t.statuses.includes(b.status)).length;
                const label = <Text style={[s.segmentText, on && { color: '#fff' }]}>{t.label}{count && t.key !== 'previous' ? ` (${count})` : ''}</Text>;
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    {on ? <BrandGradient style={s.segmentItem}>{label}</BrandGradient> : <View style={s.segmentItem}>{label}</View>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={44} color={DARK.muted} />
              <Text style={s.emptyTitle}>{tab === 'pending' ? 'No requests waiting' : tab === 'upcoming' ? 'Nothing booked yet' : 'No past bookings'}</Text>
              <Text style={s.emptyText}>{tab === 'upcoming' ? 'Find a vendor on the Home tab to make your first booking.' : ''}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.when}>
              <Ionicons name="time-outline" size={20} color="#fff" />
              <Text style={s.whenText}>{bookingWhen(item)}</Text>
            </View>
            <View style={s.body}>
              <View style={s.row}>
                <View style={s.avatar}>
                  {item.vendor?.avatar_url ? <Image source={{ uri: item.vendor.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{item.vendor?.name?.[0]?.toUpperCase() ?? 'V'}</Text>}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.vendor} numberOfLines={1}>{item.vendor?.name ?? 'Vendor'}</Text>
                  <Text style={s.service} numberOfLines={1}>{item.listing?.title ?? 'Service'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StatusPill booking={item} />
                  {item.amount != null && <Text style={s.price}>${Number(item.amount).toFixed(2)}</Text>}
                </View>
              </View>
              <View style={s.actions}>
                {(item.status === 'PENDING' || item.status === 'CONFIRMED') && (
                  <Pressable style={s.outline} onPress={() => cancel(item)} accessibilityRole="button">
                    <Text style={s.outlineText}>{item.status === 'PENDING' ? 'Cancel request' : 'Cancel booking'}</Text>
                  </Pressable>
                )}
                <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })} accessibilityRole="button">
                  <BrandGradient style={s.primary}>
                    <Text style={s.primaryText}>{item.status === 'CONFIRMED' && !item.paid_at ? 'Pay now' : item.status === 'COMPLETED' ? 'View & review' : 'View Details'}</Text>
                  </BrandGradient>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function StatusPill({ booking }: { booking: Booking }) {
  const map: Record<BookingStatus, { label: string; color: string }> = {
    PENDING: { label: 'Awaiting vendor', color: '#fcd34d' },
    CONFIRMED: { label: booking.paid_at ? 'Confirmed' : 'Payment due', color: booking.paid_at ? '#6ee7c7' : '#fcd34d' },
    IN_PROGRESS: { label: 'In progress', color: DARK.accent },
    COMPLETED: { label: 'Completed', color: '#6ee7c7' },
    CANCELLED: { label: 'Cancelled', color: DARK.muted },
    REJECTED: { label: 'Declined', color: '#fca5a5' },
  };
  const st = map[booking.status] ?? map.PENDING;
  return <Text style={[s.pill, { color: st.color }]}>{st.label}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold, textAlign: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 100, backgroundColor: DARK.card },
  segmentItem: { height: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center' },
  card: { borderRadius: 20, backgroundColor: DARK.card, overflow: 'hidden' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: DARK.field },
  whenText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  body: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  vendor: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  service: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  pill: { fontSize: 12, fontFamily: FONTS.semibold },
  price: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  actions: { flexDirection: 'row', gap: 12 },
  outline: { flex: 1, height: 50, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  primary: { height: 50, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
