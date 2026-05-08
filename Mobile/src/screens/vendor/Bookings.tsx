import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
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
import type { VendorBookingsStackParams } from '../../navigation/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

type BookingStatus = 'ALL' | 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

type Nav = NativeStackNavigationProp<VendorBookingsStackParams>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: BookingStatus }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function VendorBookings() {
  const nav = useNavigation<Nav>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/bookings/my/vendor');
      if (res.data?.success) setBookings(res.data.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = filter === 'ALL' ? bookings : bookings.filter((b) => b.status === filter);

  const renderItem = ({ item }: { item: Booking }) => {
    const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.CANCELLED;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => nav.navigate('VendorBookingDetail', { bookingId: item.id })}
        activeOpacity={0.85}
      >
        <View style={s.cardHeader}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {item.listing?.title ?? 'Listing'}
          </Text>
          <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
        </View>

        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Ionicons name="person-outline" size={12} color={COLORS.gray[400]} />
            <Text style={s.metaText}>{item.customer?.name ?? 'Customer'}</Text>
          </View>
          {item.scheduled_at && (
            <View style={s.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.gray[400]} />
              <Text style={s.metaText}>{format(new Date(item.scheduled_at), 'MMM d, yyyy')}</Text>
            </View>
          )}
          <View style={s.metaItem}>
            <Ionicons name="cash-outline" size={12} color={COLORS.gray[400]} />
            <Text style={s.metaText}>${Number(item.amount).toLocaleString()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {/* Filter tabs */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterList}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[s.filterPill, filter === f.value && s.filterPillActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[s.filterText, filter === f.value && s.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, filtered.length === 0 && s.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="calendar-outline" size={52} color={COLORS.gray[300]} />
              <Text style={s.emptyTitle}>No bookings yet</Text>
              <Text style={s.emptyText}>
                {filter === 'ALL'
                  ? 'Bookings from customers will appear here'
                  : `No ${STATUS_LABELS[filter]?.toLowerCase()} bookings`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  filterPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  filterTextActive: { color: COLORS.white },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  listEmpty: { flex: 1 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[600], marginTop: 12 },
  emptyText: { fontSize: 13, color: COLORS.gray[400], marginTop: 4, textAlign: 'center' },
});
