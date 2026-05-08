import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { VendorListingsStackParams, VendorBookingsStackParams } from '../../navigation/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  type: string;
  avatar_url?: string;
  vendorProfile?: { business_name?: string };
}

interface Listing {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  status: string;
  _count: { bookings: number };
}

interface Booking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
  listing: { title: string };
  customer?: { name: string };
  vendor?: { name: string };
  amount: number;
  message?: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  CONFIRMED: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  IN_PROGRESS: { bg: '#f3ecfe', text: '#7B2FF7', border: '#9b5ef9' },
  COMPLETED: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  CANCELLED: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

type ListingsNav = NativeStackNavigationProp<VendorListingsStackParams>;
type BookingsNav = NativeStackNavigationProp<VendorBookingsStackParams>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function VendorDashboard() {
  const listingsNav = useNavigation<ListingsNav>();
  const bookingsNav = useNavigation<BookingsNav>();

  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [userRes, bookingsRes, listingsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/bookings/my/vendor', { params: { limit: 5 } }),
        api.get('/vendor/listings', { params: { limit: 100 } }),
      ]);
      if (userRes.data?.success) setUser(userRes.data.data);
      if (bookingsRes.data?.success) setBookings(bookingsRes.data.data ?? []);
      if (listingsRes.data?.success) setListings(listingsRes.data.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const totalListings = listings.length;
  const totalBookings = bookings.length;
  const pendingCount = bookings.filter((b) => b.status === 'PENDING').length;

  const initials = (user?.name ?? 'V')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={s.headerGreeting}>Welcome back,</Text>
            <Text style={s.headerName} numberOfLines={1}>
              {user?.vendorProfile?.business_name ?? user?.name ?? 'Vendor'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.newListingBtn}
          onPress={() => listingsNav.navigate('ListingForm', { listingId: undefined })}
        >
          <Ionicons name="add" size={18} color={COLORS.white} />
          <Text style={s.newListingText}>New Listing</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <StatCard icon="list" label="Listings" value={String(totalListings)} color={COLORS.primary} />
        <StatCard icon="calendar" label="Bookings" value={String(totalBookings)} color="#1d4ed8" />
        <StatCard icon="time" label="Pending" value={String(pendingCount)} color="#b45309" />
      </View>

      {/* Recent Bookings */}
      <View style={s.section}>
        <View style={s.rowBetween}>
          <Text style={s.sectionTitle}>Recent Bookings</Text>
          <TouchableOpacity onPress={() => bookingsNav.navigate('VendorBookings')}>
            <Text style={s.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {bookings.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={COLORS.gray[300]} />
            <Text style={s.emptyTitle}>No bookings yet</Text>
            <Text style={s.emptyText}>Bookings from customers will appear here</Text>
          </View>
        ) : (
          bookings.map((booking) => (
            <TouchableOpacity
              key={booking.id}
              style={s.bookingCard}
              onPress={() => bookingsNav.navigate('VendorBookingDetail', { bookingId: booking.id })}
            >
              <View style={s.rowBetween}>
                <Text style={s.bookingTitle} numberOfLines={1}>
                  {booking.listing?.title ?? 'Listing'}
                </Text>
                <StatusBadge status={booking.status} />
              </View>
              <View style={s.bookingMeta}>
                <View style={s.metaItem}>
                  <Ionicons name="person-outline" size={12} color={COLORS.gray[400]} />
                  <Text style={s.metaText}>{booking.customer?.name ?? 'Customer'}</Text>
                </View>
                {booking.scheduled_at && (
                  <View style={s.metaItem}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.gray[400]} />
                    <Text style={s.metaText}>
                      {format(new Date(booking.scheduled_at), 'MMM d, yyyy')}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[s.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.CANCELLED;
  return (
    <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
      <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  headerGreeting: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  headerName: { fontSize: 17, fontWeight: '800', color: COLORS.white, maxWidth: 160 },
  newListingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newListingText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.gray[900], marginTop: 6 },
  statLabel: { fontSize: 11, color: COLORS.gray[500], marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[800], marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  bookingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bookingTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  bookingMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[600], marginTop: 12 },
  emptyText: { fontSize: 13, color: COLORS.gray[400], marginTop: 4, textAlign: 'center' },
});
