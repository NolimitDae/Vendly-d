import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventsService, type Event, type EventStatus } from '../../services/events.service';
import { EventCard } from './Home';
import SlidingTabs from '../../components/SlidingTabs';

const FILTERS: { label: string; value: EventStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Planning', value: 'PLANNING' },
  { label: 'Active', value: 'CONFIRMED' },
  { label: 'In progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
];

export default function MyEvents() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<EventStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await EventsService.list({ limit: 100, status: filter || undefined });
      if (res.data?.success) setEvents(res.data.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={s.root}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 20, marginBottom: 8 }}>
            <ScreenHeader title="Events" onBack={() => nav.goBack()} />
            <SlidingTabs
              scroll
              items={FILTERS.map((f) => ({ key: f.value || 'all', label: f.label }))}
              value={filter || 'all'}
              onChange={(k) => setFilter(k === 'all' ? '' : (k as EventStatus))}
              style={{ marginHorizontal: 20 }}
              accessibilityLabel="Show events"
            />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={44} color={DARK.accent} />
              <Text style={s.emptyText}>Events Not Found</Text>
              <Pressable style={s.emptyBtn} onPress={() => nav.navigate('CreateEvent')} accessibilityRole="button"><Text style={s.emptyBtnText}>Add your first event</Text></Pressable>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 20 }}>
            <EventCard event={item} onPress={() => nav.navigate('EventDetail', { eventId: item.id, eventName: item.name })} />
          </View>
        )}
      />
      <Pressable style={[s.fab, { bottom: insets.bottom + 24 }]} onPress={() => nav.navigate('CreateEvent')} accessibilityRole="button" accessibilityLabel="New event">
        <BrandGradient style={s.fabInner}><Ionicons name="add" size={32} color="#fff" /></BrandGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  empty: { marginHorizontal: 20, paddingVertical: 60, alignItems: 'center', gap: 14, borderRadius: 24, backgroundColor: DARK.card },
  emptyText: { color: '#fff', fontSize: 20, fontFamily: FONTS.medium },
  emptyBtn: { height: 48, paddingHorizontal: 22, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
  fab: { position: 'absolute', right: 20 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
