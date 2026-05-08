import React, { useCallback, useEffect, useState } from 'react';
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
import { format, isPast, isWithinInterval, addDays } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { EventsService, Event, EventTask } from '../../services/events.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EventPlannerStackParams } from '../../navigation/types';

type Nav = NativeStackNavigationProp<EventPlannerStackParams>;

const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planning',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function EPHome() {
  const nav = useNavigation<Nav>();
  const [events, setEvents] = useState<Event[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<{ task: EventTask; eventName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await EventsService.list({ limit: 50 });
      if (res.data?.success) {
        const all = res.data.data;
        setEvents(all.filter((e) => e.status !== 'CANCELLED' && e.status !== 'COMPLETED'));

        // Gather tasks due within next 7 days across all events
        const taskPromises = all
          .filter((e) => e.status !== 'CANCELLED' && e.status !== 'COMPLETED')
          .slice(0, 10)
          .map((e) =>
            EventsService.findOne(e.id).then((r) => ({
              event: e,
              tasks: r.data?.data?.tasks ?? [],
            })),
          );

        const results = await Promise.allSettled(taskPromises);
        const now = new Date();
        const soon = addDays(now, 7);
        const taskList: { task: EventTask; eventName: string }[] = [];
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            r.value.tasks
              .filter((t) => !t.completed && t.due_date)
              .filter((t) => {
                const d = new Date(t.due_date!);
                return isWithinInterval(d, { start: now, end: soon }) || isPast(d);
              })
              .forEach((t) => taskList.push({ task: t, eventName: r.value.event.name }));
          }
        });
        setUpcomingTasks(taskList.slice(0, 6));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const totalBudget = events.reduce((s, e) => s + (e.total_budget ?? 0), 0);
  const activeCount = events.filter((e) => e.status === 'IN_PROGRESS').length;
  const planningCount = events.filter((e) => e.status === 'PLANNING' || e.status === 'CONFIRMED').length;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Hero greeting */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>Event Dashboard</Text>
        <Text style={s.heroSub}>Manage all your events in one place</Text>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <StatCard icon="calendar" label="Active" value={String(activeCount)} color={COLORS.primary} />
        <StatCard icon="time" label="Planning" value={String(planningCount)} color="#f59e0b" />
        <StatCard
          icon="cash"
          label="Total Budget"
          value={`$${totalBudget.toLocaleString()}`}
          color="#10b981"
        />
      </View>

      {/* Quick actions */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsRow}>
          <ActionBtn
            icon="add-circle"
            label="New Event"
            onPress={() => nav.navigate('CreateEvent')}
          />
          <ActionBtn
            icon="list"
            label="My Events"
            onPress={() => nav.navigate('MyEvents')}
          />
          <ActionBtn
            icon="search"
            label="Find Vendors"
            onPress={() => nav.getParent()?.navigate('DiscoverTab')}
          />
        </View>
      </View>

      {/* Active events */}
      {events.length > 0 && (
        <View style={s.section}>
          <View style={s.rowBetween}>
            <Text style={s.sectionTitle}>Active Events</Text>
            <TouchableOpacity onPress={() => nav.navigate('MyEvents')}>
              <Text style={s.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>
          {events.slice(0, 3).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => nav.navigate('EventDetail', { eventId: event.id, eventName: event.name })}
            />
          ))}
        </View>
      )}

      {/* Upcoming deadlines */}
      {upcomingTasks.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Upcoming Deadlines</Text>
          {upcomingTasks.map(({ task, eventName }) => (
            <View key={task.id} style={s.taskRow}>
              <View style={[s.taskDot, isPast(new Date(task.due_date!)) && { backgroundColor: '#ef4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
                <Text style={s.taskMeta}>{eventName} · {task.due_date ? format(new Date(task.due_date), 'MMM d') : 'No date'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {events.length === 0 && (
        <View style={s.emptyState}>
          <Ionicons name="calendar-outline" size={56} color={COLORS.gray[300]} />
          <Text style={s.emptyTitle}>No active events</Text>
          <Text style={s.emptyText}>Create your first event to get started</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => nav.navigate('CreateEvent')}>
            <Text style={s.emptyBtnText}>Create Event</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={[s.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress}>
      <View style={s.actionIcon}>
        <Ionicons name={icon} size={22} color={COLORS.primary} />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const statusColor = COLORS.status[event.status as keyof typeof COLORS.status] ?? COLORS.status.PLANNING;
  return (
    <TouchableOpacity style={s.eventCard} onPress={onPress}>
      <View style={s.rowBetween}>
        <Text style={s.eventName} numberOfLines={1}>{event.name}</Text>
        <View style={[s.badge, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}>
          <Text style={[s.badgeText, { color: statusColor.text }]}>{STATUS_LABELS[event.status]}</Text>
        </View>
      </View>
      <View style={s.eventMeta}>
        {event.date && (
          <View style={s.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.gray[400]} />
            <Text style={s.metaText}>{format(new Date(event.date), 'MMM d, yyyy')}</Text>
          </View>
        )}
        {event.venue && (
          <View style={s.metaItem}>
            <Ionicons name="location-outline" size={13} color={COLORS.gray[400]} />
            <Text style={s.metaText} numberOfLines={1}>{event.venue}</Text>
          </View>
        )}
        {event._count && (
          <View style={s.metaItem}>
            <Ionicons name="briefcase-outline" size={13} color={COLORS.gray[400]} />
            <Text style={s.metaText}>{event._count.bookings} vendors</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
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
  statValue: { fontSize: 17, fontWeight: '800', color: COLORS.gray[900], marginTop: 6 },
  statLabel: { fontSize: 11, color: COLORS.gray[500], marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[800], marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 8 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.gray[700] },
  eventCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  eventName: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  eventMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 5,
  },
  taskTitle: { fontSize: 14, fontWeight: '600', color: COLORS.gray[800] },
  taskMeta: { fontSize: 12, color: COLORS.gray[500], marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray[700], marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.gray[400], marginTop: 6, textAlign: 'center' },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});
