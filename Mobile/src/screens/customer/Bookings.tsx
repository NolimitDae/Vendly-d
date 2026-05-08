import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { BookingService, Booking, BookingStatus } from '../../services/booking.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<any>;

const FILTERS: { label: string; value: BookingStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function statusColor(status: BookingStatus) {
  return COLORS.status[status as keyof typeof COLORS.status] ?? COLORS.status.COMPLETED;
}

export default function CustomerBookings() {
  const nav = useNavigation<Nav>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await BookingService.getMyBookingsAsCustomer({
        status: filter || undefined,
      });
      if (res.data?.success) {
        setBookings(res.data.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const renderItem = ({ item }: { item: Booking }) => {
    const sc = statusColor(item.status);
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
      >
        <View style={s.cardHeader}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.listing?.title ?? 'Booking'}</Text>
          <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[item.status]}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <Ionicons name="person-outline" size={12} color={COLORS.gray[400]} />
            <Text style={s.metaText}>{item.vendor?.name ?? 'Vendor'}</Text>
          </View>
          {item.scheduled_at && (
            <View style={s.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.gray[400]} />
              <Text style={s.metaText}>
                {format(new Date(item.scheduled_at), 'MMM d, yyyy')}
              </Text>
            </View>
          )}
        </View>

        {item.amount != null && (
          <Text style={s.amount}>${Number(item.amount).toLocaleString()}</Text>
        )}
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
          data={bookings}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, bookings.length === 0 && s.listEmpty]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="receipt-outline" size={52} color={COLORS.gray[300]} />
              <Text style={s.emptyText}>No bookings yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

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
  list: { paddingHorizontal: 16, paddingBottom: 32 },
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  amount: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 16, color: COLORS.gray[500], marginTop: 12 },
});
