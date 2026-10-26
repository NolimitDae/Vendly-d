import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Card, ScreenHeader } from '../../components/brand';
import RunOfShow from '../../components/events/RunOfShow';
import EventFiles from '../../components/events/EventFiles';
import ClientContractsCard from '../../components/contracts/ClientContractsCard';
import SegmentedTabs from '../../components/SegmentedTabs';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { EventToolsService, type EventOverview } from '../../services/eventTools.service';
import { ChatService } from '../../services/chat.service';
import { apiError } from '../../services/contracts.service';

type Section = 'schedule' | 'vendors' | 'files' | 'contracts';

/** An event as a booked vendor or the planner's client sees it: read-only, plus files and (vendors) ticking off their items. */
export default function EventShared() {
  const nav = useNavigation<any>();
  const { eventId, section: initialSection } = useRoute<any>().params as { eventId: string; section?: Section };
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [ev, setEv] = useState<EventOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(initialSection ?? 'schedule');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    EventToolsService.overview(eventId)
      .then((r) => setEv(r.data?.data ?? null))
      .catch((e) => setError(apiError(e)))
      .finally(() => setRefreshing(false));
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openChat = async () => {
    try {
      const r = await ChatService.openEventChat(eventId);
      nav.navigate('MessagesTab', { screen: 'ChatDetail', initial: false, params: { conversationId: r.data.data.conversation_id, participantName: ev?.name ?? 'Event chat' } });
    } catch (e) {
      setError(apiError(e));
    }
  };

  if (!ev) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <ScreenHeader title="Event" onBack={() => nav.goBack()} />
        {error ? <Text style={[s.muted, { textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }]}>{error}</Text> : <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const roleNote = ev.role === 'vendor' ? 'You’re booked for this event. Items marked for you are highlighted; tick them off on the day.' : 'Your planner shared this event with you. You can follow along; changes go through your planner.';

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
    >
      <ScreenHeader title={ev.name} onBack={() => nav.goBack()} />
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Card style={{ gap: 8 }}>
          {!!ev.date && <Row icon="calendar-outline" text={format(parseISO(ev.date), 'EEEE d MMMM yyyy')} />}
          {!!ev.venue && <Row icon="location-outline" text={ev.venue} />}
          {!!ev.planner && (
            <Pressable onPress={() => nav.navigate('PlannerPublic', { userId: ev.planner!.id })} accessibilityRole="link" accessibilityHint="Opens the planner's profile">
              <Row icon="person-outline" text={`Planned by ${ev.planner.name}`} trailing />
            </Pressable>
          )}
          <Text style={s.muted}>{roleNote}</Text>
          {ev.role === 'vendor' && (
            <Pressable style={s.chatBtn} onPress={openChat} accessibilityRole="button">
              <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
              <Text style={s.chatText}>Event chat</Text>
            </Pressable>
          )}
        </Card>

        <SegmentedTabs
          fill
          items={((ev.role === 'client' ? ['schedule', 'vendors', 'files', 'contracts'] : ['schedule', 'vendors', 'files']) as Section[]).map((k) => ({
            key: k,
            label: k === 'schedule' ? 'Run of show' : k === 'vendors' ? `Vendors (${ev.vendors.length})` : k === 'files' ? `Files (${ev.file_count})` : 'Contracts',
          }))}
          value={section}
          onChange={setSection}
          style={s.tabs}
          itemStyle={s.tab}
          textStyle={s.tabText}
          activeTextStyle={s.tabTextOn}
          indicatorColor={DARK.border}
        />

        {section === 'schedule' && <RunOfShow eventId={ev.id} eventDate={ev.date} role={ev.role} userId={user?.id} items={ev.timeline} vendors={[]} onChanged={load} readOnly={ev.status === 'CANCELLED'} />}
        {section === 'vendors' &&
          (ev.vendors.length === 0 ? (
            <Text style={s.muted}>No vendors booked yet.</Text>
          ) : (
            ev.vendors.map((v) => (
              <Card key={v.booking_id} style={s.vendorRow}>
                <View style={s.avatar}><Text style={s.avatarText}>{v.vendor.name[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vendorName}>{v.vendor.id === user?.id ? `${v.vendor.name} (you)` : v.vendor.name}</Text>
                  <Text style={s.muted}>{v.service} · {v.status.toLowerCase().replace('_', ' ')}</Text>
                </View>
                {v.total != null && <Text style={s.total}>${v.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>}
              </Card>
            ))
          ))}
        {section === 'files' && <EventFiles eventId={ev.id} role={ev.role} readOnly={ev.status === 'CANCELLED'} />}
        {section === 'contracts' && ev.role === 'client' && <ClientContractsCard eventId={ev.id} />}
      </View>
    </ScrollView>
  );
}

function Row({ icon, text, trailing }: { icon: keyof typeof Ionicons.glyphMap; text: string; trailing?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={18} color={DARK.accent} />
      <Text style={[s.body, trailing && { flex: 1 }]}>{text}</Text>
      {trailing && <Ionicons name="chevron-forward" size={16} color={DARK.muted} />}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  body: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: DARK.border },
  chatText: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  tabs: { flexDirection: 'row', backgroundColor: DARK.card, borderRadius: 100, padding: 4 },
  tab: { height: 40, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
  tabTextOn: { color: '#fff' },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontFamily: FONTS.semibold },
  vendorName: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  total: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
});
