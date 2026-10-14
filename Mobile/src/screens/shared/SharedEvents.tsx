import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventToolsService } from '../../services/eventTools.service';

type Shared = { id: string; name: string; date?: string | null; venue?: string | null; status: string; event_planner: { id: string; name: string } };

/** Events a planner has shared with this user (as their client). */
export default function SharedEvents() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Shared[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      EventToolsService.shared().then((r) => setEvents(r.data?.data ?? [])).catch(() => setEvents([]));
    }, []),
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Shared events" onBack={() => nav.goBack()} />
      {!events ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 20, gap: 12 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={DARK.accent} />
              <Text style={s.title}>Nothing shared yet</Text>
              <Text style={s.muted}>When your event planner shares an event with your email, it shows up here: vendors, the run of show and files.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => nav.navigate('EventShared', { eventId: item.id })} accessibilityRole="button">
              <View style={s.icon}><Ionicons name="sparkles-outline" size={22} color={DARK.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{item.name}</Text>
                <Text style={s.muted}>{[item.date ? format(parseISO(item.date), 'EEE d MMM yyyy') : null, item.venue].filter(Boolean).join(' · ') || 'Date to be confirmed'}</Text>
                <Text style={s.muted}>Planned by {item.event_planner.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  empty: { alignItems: 'center', gap: 8, padding: 28, backgroundColor: DARK.card, borderRadius: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 16, padding: 14 },
  icon: { width: 46, height: 46, borderRadius: 14, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
});
