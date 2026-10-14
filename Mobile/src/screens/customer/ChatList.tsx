import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, parseISO } from 'date-fns';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, type Conversation } from '../../services/chat.service';
import { useAuth } from '../../context/AuthContext';

export default function ChatList() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await ChatService.getConversations();
      if (res.data?.success) setConversations(res.data.data);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const other = (c: Conversation) => c.participants.find((p) => p.id !== user?.id) ?? c.participants[0];
  const when = (iso: string) => {
    if (!iso) return '';
    const d = parseISO(iso);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
  };
  const items = conversations.filter((c) => !q || (other(c)?.name ?? '').toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={s.root}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 24, marginBottom: 12 }}>
            <Text style={s.title}>Message</Text>
            <View style={s.search}>
              <Ionicons name="search-outline" size={22} color={DARK.muted} />
              <TextInput style={s.searchInput} placeholder="Search..." placeholderTextColor={DARK.muted} value={q} onChangeText={setQ} />
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={DARK.muted} />
              <Text style={s.emptyTitle}>{q ? 'No one by that name' : 'No conversations yet'}</Text>
              <Text style={s.emptyText}>{q ? '' : 'Message a vendor from their profile or a booking and it shows up here.'}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const o = other(item);
          return (
            <Pressable
              style={s.row}
              onPress={() => navigation.navigate('ChatDetail', { conversationId: item.id, participantName: o?.name ?? 'User', avatar: o?.avatar })}
              accessibilityRole="button"
            >
              <View style={s.avatar}>
                {o?.avatar ? <Image source={{ uri: o.avatar }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{(o?.name ?? '?')[0].toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.name} numberOfLines={1}>{o?.name ?? 'User'}</Text>
                <Text style={s.preview} numberOfLines={1}>{item.last_message?.content || 'No messages yet'}</Text>
              </View>
              <Text style={s.time}>{when(item.updated_at)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold, textAlign: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, height: 56, borderRadius: 28, paddingHorizontal: 18, backgroundColor: DARK.field },
  searchInput: { flex: 1, color: '#fff', fontSize: 18, fontFamily: FONTS.regular, paddingVertical: 0 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  name: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  preview: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.regular },
  time: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular, alignSelf: 'flex-start', paddingTop: 4 },
});
