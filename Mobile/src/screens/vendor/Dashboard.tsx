import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { BookingService, type Booking } from '../../services/booking.service';
import { bookingWhen } from '../customer/Bookings';
import { useFeature } from '../../hooks/useFeature';
import { openInTab } from '../../navigation/crossTab';

type Nav = NativeStackNavigationProp<any>;

/** GET /vendor/dashboard/stats: earned is what reached you after commission and refunds (as on Payouts) */
interface DashboardStats {
  revenue_by_month: { month: string; label: string; earned: number }[];
  total_earned: number;
  bookings: { total: number; by_status: Record<string, number>; upcoming: number };
  rating: { average: number | null; count: number };
  top_clients: { id: string; name: string | null; earned: number; bookings: number }[];
}

const MONTHS = 12;
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function VendorDashboard() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [listings, setListings] = useState<{ id: string; status: string }[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, l, st] = await Promise.all([
        BookingService.getMyBookingsAsVendor({ limit: 100 }),
        api.get('/vendor/listings', { params: { limit: 100 } }),
        // worked out on the server over all bookings
        api.get('/vendor/dashboard/stats', { params: { months: MONTHS, tz: deviceZone() } }).catch(() => null),
      ]);
      if (b.data?.success) setBookings(b.data.data ?? []);
      if (l.data?.success) setListings(l.data.data ?? []);
      if (st?.data?.success) setStats(st.data.data);
    } catch {
      // keep what we have
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingCount = stats?.bookings.by_status.PENDING ?? bookings.filter((b) => b.status === 'PENDING').length;
  const upcoming = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
  const rating = stats?.rating.average ?? null;
  const firstName = (user?.name ?? '').split(' ')[0];
  const months = stats?.revenue_by_month ?? [];
  const best = Math.max(0, ...months.map((m) => m.earned));

  const tiles = [
    { label: 'Total Bookings', value: stats ? String(stats.bookings.total) : '–' },
    { label: `Earned (${MONTHS} mo)`, value: stats ? money(stats.total_earned) : '–' },
    { label: 'Average Rating', value: rating != null ? rating.toFixed(1) : '–' },
    { label: 'Packages', value: String(listings.filter((l) => l.status === 'ACTIVE').length) },
  ];

  const rentalsOn = useFeature('rentals');
  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: 'add-circle-outline', label: 'Add package', onPress: () => nav.navigate('ListingForm') },
    { icon: 'albums-outline', label: 'My packages', onPress: () => nav.navigate('VendorListings') },
    { icon: 'pricetags-outline', label: 'Add-ons', onPress: () => nav.navigate('AddOns', { tab: 'ADD_ON' }) },
    { icon: 'receipt-outline', label: 'Fees', onPress: () => nav.navigate('AddOns', { tab: 'FEE' }) },
    ...(rentalsOn ? [{ icon: 'cube-outline' as const, label: 'Rental stock', onPress: () => nav.navigate('RentalInventory') }] : []),
    { icon: 'calendar-outline', label: 'Bookings', onPress: () => nav.navigate('BookingsTab') },
    { icon: 'wallet-outline', label: 'Payouts', onPress: () => openInTab(nav, 'ProfileTab', 'Payouts') },
    { icon: 'document-text-outline', label: 'Contracts', onPress: () => openInTab(nav, 'ProfileTab', 'VendorContracts') },
  ];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 20, gap: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
    >
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>Hello {firstName || 'there'}!</Text>
          <Text style={s.sub}>{pendingCount ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting for you` : 'Here is how your business is doing'}</Text>
        </View>
        <Pressable style={s.avatar} onPress={() => nav.navigate('ProfileTab')} accessibilityRole="button" accessibilityLabel="Settings">
          {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{(firstName[0] ?? 'V').toUpperCase()}</Text>}
        </Pressable>
      </View>

      {pendingCount > 0 && (
        <Pressable onPress={() => nav.navigate('BookingsTab')} accessibilityRole="button">
          <BrandGradient style={s.alert}>
            <Ionicons name="time-outline" size={22} color="#fff" />
            <Text style={s.alertText}>{pendingCount} booking request{pendingCount === 1 ? '' : 's'} need your answer</Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </BrandGradient>
        </Pressable>
      )}

      <View style={{ gap: 12 }}>
        <Text style={s.sectionTitle}>Analytics</Text>
        <View style={s.grid}>
          {tiles.map((st) => (
            <BrandGradient key={st.label} style={s.stat}>
              <Text style={s.statLabel}>{st.label}</Text>
              <Text style={s.statValue} adjustsFontSizeToFit numberOfLines={1}>{st.value}</Text>
            </BrandGradient>
          ))}
        </View>
        {stats && (
          <Text style={s.hint}>
            {stats.bookings.by_status.COMPLETED ?? 0} completed · {(stats.bookings.by_status.CONFIRMED ?? 0) + (stats.bookings.by_status.IN_PROGRESS ?? 0)} confirmed · {stats.bookings.by_status.CANCELLED ?? 0} cancelled. Earned is what reached you in the last {MONTHS} months, after Vendly commission and refunds.
          </Text>
        )}
      </View>

      {months.length > 0 && (
        <Card style={{ gap: 14 }}>
          <Text style={s.cardTitle}>Earned by month</Text>
          {/* plain bars: the tallest month fills the height */}
          <View style={s.chart} accessible accessibilityLabel={months.map((m) => `${m.label} ${money(m.earned)}`).join(', ')}>
            {months.map((m) => (
              <View key={m.month} style={s.barCol}>
                <View style={s.barTrack}>
                  {m.earned > 0 && <BrandGradient style={[s.bar, { height: `${Math.max(4, (m.earned / best) * 100)}%` }]} />}
                </View>
                <Text style={s.barLabel}>{m.label.slice(0, 1)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.hint}>
            {best > 0
              ? `Best month: ${months.find((m) => m.earned === best)?.label} at ${money(best)}`
              : 'Nothing paid out yet in the last 12 months.'}
          </Text>
        </Card>
      )}

      {!!stats?.top_clients.length && (
        <Card style={{ gap: 10 }}>
          <Text style={s.cardTitle}>Top clients</Text>
          {stats.top_clients.map((c, i) => (
            <View key={c.id} style={s.client}>
              <Text style={s.clientRank}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.clientName} numberOfLines={1}>{c.name ?? 'Customer'}</Text>
                <Text style={s.hint}>{c.bookings} booking{c.bookings === 1 ? '' : 's'}</Text>
              </View>
              <Text style={s.clientAmount}>{money(c.earned)}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ gap: 12 }}>
        <Text style={s.sectionTitle}>Quick actions</Text>
        <View style={s.grid}>
          {actions.map((a) => (
            <Pressable key={a.label} style={s.action} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}>
              <Ionicons name={a.icon} size={26} color={DARK.accent} />
              <Text style={s.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <View style={s.rowBetween}>
          <Text style={s.sectionTitle}>Upcoming{stats?.bookings.upcoming ? ` (${stats.bookings.upcoming})` : ''}</Text>
          <Pressable onPress={() => nav.navigate('BookingsTab')} hitSlop={8}>
            <Text style={s.link}>See all</Text>
          </Pressable>
        </View>
        {upcoming.length === 0 ? (
          <Card style={s.empty}>
            <Ionicons name="analytics-outline" size={40} color={DARK.accent} />
            <Text style={s.emptyText}>No upcoming bookings yet</Text>
          </Card>
        ) : (
          upcoming.slice(0, 3).map((b) => (
            <Pressable key={b.id} style={s.booking} onPress={() => openInTab(nav, 'BookingsTab', 'VendorBookingDetail', { bookingId: b.id })} accessibilityRole="button">
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.bookingTitle} numberOfLines={1}>{b.listing?.title ?? 'Booking'}</Text>
                <Text style={s.bookingMeta}>{b.customer?.name ?? 'Customer'} · {bookingWhen(b)}</Text>
              </View>
              <Text style={s.bookingAmount}>${Number(b.amount ?? 0).toFixed(0)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  sub: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 16 },
  alertText: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  sectionTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.medium },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { width: '47.5%', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 6 },
  statLabel: { color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  statValue: { color: '#fff', fontSize: 28, fontFamily: FONTS.semibold, paddingHorizontal: 8 },
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { color: DARK.muted, fontSize: 11, fontFamily: FONTS.medium },
  client: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientRank: { width: 18, color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  clientName: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  clientAmount: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  action: { width: '47.5%', borderRadius: 16, backgroundColor: DARK.card, paddingVertical: 18, alignItems: 'center', gap: 8 },
  actionText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  emptyText: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.regular },
  booking: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: DARK.card },
  bookingTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  bookingMeta: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  bookingAmount: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
});
