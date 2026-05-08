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
import { EventsService, Event, EventStatus } from '../../services/events.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EventPlannerStackParams } from '../../navigation/types';

type Nav = NativeStackNavigationProp<EventPlannerStackParams>;

const FILTERS: { label: string; value: EventStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Planning', value: 'PLANNING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
];

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planning',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function MyEvents() {
  const nav = useNavigation<Nav>();
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    const pg = reset ? 1 : page;
    if (reset) { setLoading(true); setPage(1); setHasMore(true); }
    try {
      const res = await EventsService.list({
        page: pg,
        limit: 15,
        status: filter || undefined,
      });
      if (res.data?.success) {
        const newData = res.data.data;
        setEvents(reset ? newData : (prev) => [...prev, ...newData]);
        setHasMore(pg < res.data.meta.last_page);
        setPage(pg + 1);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter, page]);

  useFocusEffect(
    useCallback(() => { load(true); }, [filter]),
  );

  const onRefresh = () => { setRefreshing(true); load(true); };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    load();
  };

  const renderItem = ({ item }: { item: Event }) => {
    const sc = COLORS.status[item.status as keyof typeof COLORS.status] ?? COLORS.status.PLANNING;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => nav.navigate('EventDetail', { eventId: item.id, eventName: item.name })}
      >
        <View style={s.cardHeader}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          <View style={[s.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABELS[item.status]}</Text>
          </View>
        </View>

        <View style={s.metaRow}>
          {item.type && (
            <View style={s.metaItem}>
              <Ionicons name="pricetag-outline" size={12} color={COLORS.gray[400]} />
              <Text style={s.metaText}>{item.type.replace('_', ' ')}</Text>
            </View>
          )}
          {item.date && (
            <View style={s.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.gray[400]} />
              <Text style={s.metaText}>{format(new Date(item.date), 'MMM d, yyyy')}</Text>
            </View>
          )}
          {item.venue && (
            <View style={s.metaItem}>
              <Ionicons name="location-outline" size={12} color={COLORS.gray[400]} />
              <Text style={s.metaText} numberOfLines={1}>{item.venue}</Text>
            </View>
          )}
        </View>

        <View style={s.cardFooter}>
          {item.total_budget != null && (
            <Text style={s.budgetText}>Budget: ${Number(item.total_budget).toLocaleString()}</Text>
          )}
          {item._count && (
            <View style={s.countRow}>
              <Text style={s.countText}>{item._count.bookings} vendors</Text>
              <Text style={s.countDot}>·</Text>
              <Text style={s.countText}>{item._count.tasks} tasks</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {/* Filter pills */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterList}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[s.filterPill, filter === f.value && s.filterPillActive]}
            onPress={() => { setFilter(f.value); setPage(1); }}
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
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, events.length === 0 && s.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="calendar-outline" size={52} color={COLORS.gray[300]} />
              <Text style={s.emptyText}>No events yet</Text>
              <TouchableOpacity style={s.createBtn} onPress={() => nav.navigate('CreateEvent')}>
                <Text style={s.createBtnText}>Create your first event</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => nav.navigate('CreateEvent')}>
        <Ionicons name="add" size={28} color={COLORS.white} />
      </TouchableOpacity>
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
  list: { paddingHorizontal: 16, paddingBottom: 100 },
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
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetText: { fontSize: 13, fontWeight: '600', color: COLORS.gray[700] },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countText: { fontSize: 12, color: COLORS.gray[400] },
  countDot: { fontSize: 12, color: COLORS.gray[300] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 16, color: COLORS.gray[500], marginTop: 12 },
  createBtn: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  createBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
