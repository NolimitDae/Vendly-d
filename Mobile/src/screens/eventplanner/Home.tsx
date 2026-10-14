import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { BookingService, type Booking } from '../../services/booking.service';
import { EventsService, type Event, type EventStatus } from '../../services/events.service';

export const EVENT_STATUS: Record<EventStatus, { label: string; color: string }> = {
  PLANNING: { label: 'Planning', color: '#fcd34d' },
  CONFIRMED: { label: 'Active', color: '#6ee7c7' },
  IN_PROGRESS: { label: 'In progress', color: DARK.accent },
  COMPLETED: { label: 'Completed', color: '#6ee7c7' },
  CANCELLED: { label: 'Cancelled', color: DARK.muted },
};

export function EventCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const st = EVENT_STATUS[event.status] ?? EVENT_STATUS.PLANNING;
  return (
    <Pressable style={s.event} onPress={onPress} accessibilityRole="button" accessibilityLabel={event.name}>
      <View style={s.eventIcon}>
        <Ionicons name={event.type === 'WEDDING' ? 'heart-outline' : event.type === 'BIRTHDAY' ? 'gift-outline' : event.type === 'CORPORATE' || event.type === 'CONFERENCE' ? 'briefcase-outline' : event.type === 'CONCERT' ? 'musical-notes-outline' : 'sparkles-outline'} size={34} color={DARK.accent} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={s.eventName} numberOfLines={1}>{event.name}</Text>
        <View style={s.meta}>
          <Ionicons name="calendar-outline" size={18} color="#fff" />
          <Text style={s.metaText} numberOfLines={1}>{event.date ? format(parseISO(event.date), 'MMM d') : 'No date'}{event.venue ? `  •  ${event.venue}` : ''}</Text>
        </View>
      </View>
      <View style={s.pill}>
        <View style={[s.dot, { backgroundColor: st.color }]} />
        <Text style={s.pillText}>{st.label}</Text>
      </View>
    </Pressable>
  );
}

export default function EPHome() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, b] = await Promise.all([EventsService.list({ limit: 50 }), BookingService.getMyBookingsAsCustomer({ limit: 100 })]);
      if (e.data?.success) setEvents(e.data.data ?? []);
      if (b.data?.success) setBookings(b.data.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = events.filter((e) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED');
  const pending = bookings.filter((b) => b.status === 'PENDING').length;
  const booked = bookings.filter((b) => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status)).length;
  const budget = events.reduce((sum, e) => sum + Number(e.total_budget ?? 0), 0);
  const firstName = (user?.name ?? '').split(' ')[0];
  const stats = [
    { label: 'Active Events', value: String(active.length).padStart(2, '0') },
    { label: 'Pending Requests', value: String(pending).padStart(2, '0') },
    { label: 'Booked Services', value: String(booked).padStart(2, '0') },
    { label: 'Total Budget', value: `$${budget.toLocaleString()}` },
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
          <Text style={s.sub}>{active.length ? `${active.length} event${active.length === 1 ? '' : 's'} in the works` : 'Plan your first event'}</Text>
        </View>
        <Pressable style={s.avatar} onPress={() => nav.navigate('ProfileTab')} accessibilityRole="button" accessibilityLabel="Settings">
          {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{(firstName[0] ?? 'P').toUpperCase()}</Text>}
        </Pressable>
      </View>

      <View style={{ gap: 12 }}>
        <Text style={s.sectionTitle}>Analytics</Text>
        <View style={s.grid}>
          {stats.map((st) => (
            <BrandGradient key={st.label} style={s.stat}>
              <Text style={s.statLabel}>{st.label}</Text>
              <Text style={s.statValue}>{st.value}</Text>
            </BrandGradient>
          ))}
        </View>
      </View>

      <View style={s.grid}>
        <Pressable style={s.action} onPress={() => nav.navigate('CreateEvent')} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={26} color={DARK.accent} />
          <Text style={s.actionText}>New event</Text>
        </Pressable>
        <Pressable style={s.action} onPress={() => nav.navigate('FindVendors')} accessibilityRole="button">
          <Ionicons name="search-outline" size={26} color={DARK.accent} />
          <Text style={s.actionText}>Find vendors</Text>
        </Pressable>
      </View>

      <View style={{ gap: 12 }}>
        <View style={s.rowBetween}>
          <Text style={s.sectionTitle}>Recent Events</Text>
          <Pressable onPress={() => nav.navigate('MyEvents')} hitSlop={8}><Text style={s.link}>See all</Text></Pressable>
        </View>
        {events.length === 0 ? (
          <Card style={s.empty}>
            <Ionicons name="calendar-outline" size={40} color={DARK.accent} />
            <Text style={s.emptyText}>Events Not Found</Text>
            <Pressable style={s.emptyBtn} onPress={() => nav.navigate('CreateEvent')} accessibilityRole="button"><Text style={s.emptyBtnText}>Add your first event</Text></Pressable>
          </Card>
        ) : (
          events.slice(0, 4).map((e) => <EventCard key={e.id} event={e} onPress={() => nav.navigate('EventDetail', { eventId: e.id, eventName: e.name })} />)
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
  sectionTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.medium },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { width: '47.5%', borderRadius: 16, paddingVertical: 20, alignItems: 'center', gap: 6 },
  statLabel: { color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  statValue: { color: '#fff', fontSize: 28, fontFamily: FONTS.semibold },
  action: { flex: 1, borderRadius: 16, backgroundColor: DARK.card, paddingVertical: 18, alignItems: 'center', gap: 8 },
  actionText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  emptyText: { color: '#fff', fontSize: 20, fontFamily: FONTS.medium },
  emptyBtn: { height: 48, paddingHorizontal: 22, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
  event: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, backgroundColor: DARK.card },
  eventIcon: { width: 80, height: 80, borderRadius: 14, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  eventName: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular, flexShrink: 1 },
  pill: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: DARK.field },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
});
