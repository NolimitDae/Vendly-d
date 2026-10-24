import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { vendorAnswersWithin } from '../../utils/requests';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { BookingService, type Booking, type BookingStatus } from '../../services/booking.service';
import type { CustomerBookingsStackParams } from '../../navigation/types';
import { confirmCancelBooking } from '../../components/booking/cancelBooking';
import { customerTabOf, type CustomerTab } from '../../utils/bookingTabs';

// the order in the design; every booking is in exactly one
const TABS: { key: CustomerTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'pending', label: 'Pending' },
  { key: 'complete', label: 'Complete' },
];
const EMPTY: Record<CustomerTab, string> = {
  active: 'Nothing happening right now',
  upcoming: 'Nothing booked yet',
  pending: 'No requests waiting',
  complete: 'No past bookings',
};

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
  const [tab, setTab] = useState<CustomerTab>('upcoming');
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

  const now = new Date();
  const items = all
    .filter((b) => customerTabOf(b, now) === tab)
    .sort((a, b) => (a.event_start_at ?? a.scheduled_at ?? a.created_at).localeCompare(b.event_start_at ?? b.scheduled_at ?? b.created_at) * (tab === 'complete' ? -1 : 1));

  // shows what cancelling does with the money first, then the refund result
  const cancel = (b: Booking) =>
    confirmCancelBooking({ bookingId: b.id, role: 'CUSTOMER', title: b.status === 'PENDING' ? 'Cancel this request?' : 'Cancel this booking?', onCancelled: () => load() });

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
                const count = all.filter((b) => customerTabOf(b, now) === t.key).length;
                const label = (
                  <Text style={[s.segmentText, on && { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {t.label}{count && t.key !== 'complete' ? ` (${count})` : ''}
                  </Text>
                );
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
              <Text style={s.emptyTitle}>{EMPTY[tab]}</Text>
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
                  {item.status === 'PENDING' && !!vendorAnswersWithin(item.request_expires_at) && (
                    <Text style={s.closes} numberOfLines={1}>{vendorAnswersWithin(item.request_expires_at)}</Text>
                  )}
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
                    <Text style={s.primaryText}>{item.status === 'CONFIRMED' && !item.paid_at && !item.payment_plan ? 'Pay now' : item.status === 'COMPLETED' ? 'View & review' : 'View Details'}</Text>
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
  // A booking on a payment plan is paid in instalments, so it is never "payment due" as a whole.
  const due = !booking.paid_at && !booking.payment_plan;
  const map: Record<BookingStatus, { label: string; color: string }> = {
    PENDING: { label: 'Awaiting vendor', color: '#fcd34d' },
    CONFIRMED: { label: due ? 'Payment due' : 'Confirmed', color: due ? '#fcd34d' : '#6ee7c7' },
    IN_PROGRESS: { label: 'In progress', color: DARK.accent },
    COMPLETED: { label: 'Completed', color: '#6ee7c7' },
    CANCELLED: { label: 'Cancelled', color: DARK.muted },
    // a request nobody answered in time closed on its own
    REJECTED: { label: booking.expired_at ? 'Expired' : 'Declined', color: '#fca5a5' },
  };
  const st = map[booking.status] ?? map.PENDING;
  return <Text style={[s.pill, { color: st.color }]}>{st.label}</Text>;
}

const s = StyleSheet.create({
  closes: { color: '#fcd34d', fontSize: 12, fontFamily: FONTS.medium },
  root: { flex: 1, backgroundColor: DARK.bg },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold, textAlign: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 100, backgroundColor: DARK.card },
  segmentItem: { height: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium, paddingHorizontal: 4 },
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
