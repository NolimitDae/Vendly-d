import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { BookingService, type Booking, type BookingStatus } from '../../services/booking.service';
import type { VendorBookingsStackParams } from '../../navigation/types';
import { bookingWhen } from '../customer/Bookings';
import { disputeCategoryText } from '../../components/DisputeDetails';
import { cancellationLine, PAYMENT_STATE_LABELS } from '../../utils/bookingStatus';

type Tab = 'pending' | 'upcoming' | 'completed' | 'refunds' | 'complaints';
const TABS: { key: Tab; label: string; statuses?: BookingStatus[]; filter?: 'refunds' | 'complaints' }[] = [
  { key: 'pending', label: 'Pending', statuses: ['PENDING'] },
  { key: 'upcoming', label: 'Upcoming', statuses: ['CONFIRMED', 'IN_PROGRESS'] },
  { key: 'completed', label: 'Completed', statuses: ['COMPLETED', 'CANCELLED', 'REJECTED'] },
  // filtered on the server: money went back to the customer / the customer reported a problem (open first)
  { key: 'refunds', label: 'Refunds', filter: 'refunds' },
  { key: 'complaints', label: 'Complaints', filter: 'complaints' },
];

const EMPTY: Record<Tab, [string, string]> = {
  pending: ['No requests right now', 'New requests show up here the moment a customer signs.'],
  upcoming: ['Nothing booked yet', ''],
  completed: ['No past bookings', ''],
  refunds: ['No refunds', 'Bookings where money went back to the customer show up here.'],
  complaints: ['No complaints', 'If a customer reports a problem, it shows up here.'],
};

export default function VendorBookings() {
  const nav = useNavigation<NativeStackNavigationProp<VendorBookingsStackParams>>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('pending');
  const [all, setAll] = useState<Booking[]>([]);
  const [filtered, setFiltered] = useState<Partial<Record<'refunds' | 'complaints', Booking[]>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const current = TABS.find((t) => t.key === tab)!;

  const load = useCallback(async () => {
    try {
      const [res, extra] = await Promise.all([
        BookingService.getMyBookingsAsVendor({ limit: 100 }),
        current.filter ? BookingService.getMyBookingsAsVendor({ limit: 100, filter: current.filter }) : Promise.resolve(null),
      ]);
      if (res.data?.success) setAll(res.data.data ?? []);
      if (current.filter && extra?.data?.success) setFiltered((f) => ({ ...f, [current.filter!]: extra.data.data ?? [] }));
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [current.filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = current.filter ? filtered[current.filter] ?? [] : all.filter((b) => current.statuses!.includes(b.status));
  const waiting = !!current.filter && !filtered[current.filter];

  const decline = (b: Booking) =>
    Alert.alert('Decline this request?', `${b.customer?.name ?? 'The customer'} will be told you can't take this booking.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await BookingService.rejectBooking(b.id);
            load();
          } catch (err: any) {
            Alert.alert('Could not decline', err?.response?.data?.message ?? 'Try again in a moment.');
          }
        },
      },
    ]);

  const open = (b: Booking) => nav.navigate('VendorBookingDetail', { bookingId: b.id });

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.segment} accessibilityRole="tablist">
              {TABS.map((t) => {
                const on = t.key === tab;
                const count = t.statuses ? all.filter((b) => t.statuses!.includes(b.status)).length : 0;
                const label = <Text style={[s.segmentText, on && { color: '#fff' }]}>{t.label}{count && t.key !== 'completed' ? ` (${count})` : ''}</Text>;
                return (
                  <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    {on ? <BrandGradient style={s.segmentItem}>{label}</BrandGradient> : <View style={s.segmentItem}>{label}</View>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading || waiting ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name={tab === 'complaints' ? 'chatbox-ellipses-outline' : tab === 'refunds' ? 'return-down-back-outline' : 'calendar-outline'} size={44} color={DARK.muted} />
              <Text style={s.emptyTitle}>{EMPTY[tab][0]}</Text>
              <Text style={s.emptyText}>{EMPTY[tab][1]}</Text>
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
                  {item.customer?.avatar ? <Image source={{ uri: item.customer.avatar }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{item.customer?.name?.[0]?.toUpperCase() ?? 'C'}</Text>}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.name} numberOfLines={1}>{item.customer?.name ?? 'Customer'}</Text>
                  <Text style={s.service} numberOfLines={1}>{item.listing?.title ?? 'Service'}</Text>
                  {!!item.venue_address && <Text style={s.service} numberOfLines={1}>{item.venue_address}</Text>}
                  {item.status === 'CANCELLED' && !!cancellationLine(item, 'VENDOR') && <Text style={s.service} numberOfLines={2}>{cancellationLine(item, 'VENDOR')}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {/* a missed deposit or balance: the customer has 12 hours to pay */}
                  <Text style={[s.priceLabel, !!item.payment_state && { color: '#fcd34d' }]}>{item.payment_state ? PAYMENT_STATE_LABELS[item.payment_state] : item.status === 'COMPLETED' ? 'Earned' : item.status === 'CANCELLED' || item.status === 'REJECTED' ? item.status === 'REJECTED' ? 'Declined' : 'Cancelled' : item.paid_at ? 'Paid' : 'Price'}</Text>
                  <Text style={s.price}>${Number(item.amount ?? 0).toFixed(2)}</Text>
                </View>
              </View>
              {(!!item.dispute_opened_at || Number(item.refunded_total ?? 0) > 0 || Number(item.given_back ?? 0) > 0) && (
                <View style={s.badges}>
                  {!!item.dispute_opened_at && (
                    <Text style={[s.badge, item.dispute_resolved_at ? s.badgeDone : s.badgeOpen]}>
                      {item.dispute_resolved_at ? 'Complaint resolved' : 'Complaint open'}
                      {item.dispute_category ? ` · ${disputeCategoryText(item.dispute_category)}` : ''}
                    </Text>
                  )}
                  {Number(item.refunded_total ?? 0) > 0 && <Text style={[s.badge, s.badgeDone]}>${Number(item.refunded_total).toFixed(2)} refunded</Text>}
                  {Number(item.given_back ?? 0) > 0 && <Text style={[s.badge, s.badgeDone]}>${Number(item.given_back).toFixed(2)} given back</Text>}
                </View>
              )}
              <View style={s.actions}>
                {item.status === 'PENDING' ? (
                  <>
                    <Pressable style={s.outline} onPress={() => decline(item)} accessibilityRole="button">
                      <Text style={s.outlineText}>Decline</Text>
                    </Pressable>
                    <Pressable style={{ flex: 1 }} onPress={() => open(item)} accessibilityRole="button">
                      <BrandGradient style={s.primary}>
                        <Text style={s.primaryText}>Review & Accept</Text>
                      </BrandGradient>
                    </Pressable>
                  </>
                ) : (
                  <Pressable style={{ flex: 1 }} onPress={() => open(item)} accessibilityRole="button">
                    <BrandGradient style={s.primary}>
                      <Text style={s.primaryText}>{item.status === 'CONFIRMED' && item.paid_at ? 'Start or view' : 'View Details'}</Text>
                    </BrandGradient>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold, textAlign: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 100, backgroundColor: DARK.card, gap: 2 },
  segmentItem: { height: 44, paddingHorizontal: 16, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { fontSize: 12, fontFamily: FONTS.medium, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, overflow: 'hidden' },
  badgeOpen: { color: '#fcd34d', backgroundColor: 'rgba(252,211,77,0.15)' },
  badgeDone: { color: DARK.text, backgroundColor: DARK.field },
  segmentText: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center' },
  card: { borderRadius: 20, backgroundColor: DARK.card, overflow: 'hidden' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: DARK.field },
  whenText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  body: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  name: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  service: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  priceLabel: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  price: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  actions: { flexDirection: 'row', gap: 12 },
  outline: { flex: 1, height: 50, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  primary: { height: 50, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
