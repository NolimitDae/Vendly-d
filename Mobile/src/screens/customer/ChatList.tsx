import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, parseISO } from 'date-fns';
import { BrandGradient } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, type Conversation, type InboxCounts, type InboxTab } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { useAuth } from '../../context/AuthContext';

// Vendors' inbox is split so booking clients aren't buried under first questions (sorted on the server)
const TABS: { key: InboxTab; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'inquiries', label: 'Inquiries' },
];
const EMPTY: Record<InboxTab, [string, string]> = {
  clients: ['No clients yet', 'Chats with customers who have booked you or sent a booking request show up here.'],
  inquiries: ['No inquiries', "Questions from customers who haven't booked yet show up here."],
};

export default function ChatList() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const isVendor = user?.type === 'VENDOR';
  const [tab, setTab] = useState<InboxTab>('clients');
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  // a slow answer for the tab just left must not replace the new tab's list
  const latest = useRef(0);
  const listRef = useRef(conversations);
  listRef.current = conversations;

  const load = useCallback(async () => {
    const call = ++latest.current;
    try {
      if (isVendor) {
        const res = await ChatService.getInboxTab(tab);
        if (call !== latest.current) return;
        if (res.success) {
          setConversations(res.conversations);
          setCounts(res.counts);
        }
      } else {
        const res = await ChatService.getConversations();
        if (res.data?.success) setConversations(res.data.data);
      }
    } catch {
      // keep what we have
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [isVendor, tab]);

  const pickTab = (t: InboxTab) => {
    if (t === tab) return;
    setConversations([]);
    setLoading(true);
    setTab(t);
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // I read a chat (here or on another device): its unread badge goes
  useEffect(() => {
    const onRead = (e: { conversation_id: string; user_id: string }) => {
      if (e?.user_id !== user?.id) return;
      const read = listRef.current.find((c) => c.id === e.conversation_id && c.unread);
      if (!read) return;
      setConversations((list) => list.map((c) => (c.id === read.id ? { ...c, unread: 0 } : c)));
      // and the tab's badge
      const n = read.unread ?? 0;
      setCounts((cs) => (cs ? { ...cs, [tab]: { ...cs[tab], unread: Math.max(0, cs[tab].unread - 1), unread_messages: Math.max(0, cs[tab].unread_messages - n) } } : cs));
    };
    SocketService.on('conversationRead', onRead);
    return () => SocketService.off('conversationRead', onRead);
  }, [user?.id, tab]);

  const other = (c: Conversation) => c.participants.find((p) => p.id !== user?.id) ?? c.participants[0];
  const when = (iso: string) => {
    if (!iso) return '';
    const d = parseISO(iso);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
  };
  const nameOf = (c: Conversation) => (c.is_group ? c.title ?? 'Event chat' : other(c)?.name ?? 'User');
  const items = conversations.filter((c) => !q || nameOf(c).toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={s.root}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        ListHeaderComponent={
          <View style={{ gap: 24, marginBottom: 12 }}>
            <Text style={s.title}>Message</Text>
            {isVendor && (
              <View style={s.segment} accessibilityRole="tablist">
                {TABS.map((t) => {
                  const on = t.key === tab;
                  const unread = counts?.[t.key].unread ?? 0;
                  const label = (
                    <>
                      <Text style={[s.segmentText, on && { color: '#fff' }]}>{t.label}</Text>
                      {unread > 0 && (
                        <View style={[s.badge, s.segmentBadge, on && s.segmentBadgeOn]}>
                          <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                        </View>
                      )}
                    </>
                  );
                  return (
                    <Pressable
                      key={t.key}
                      style={{ flex: 1 }}
                      onPress={() => pickTab(t.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={unread ? `${t.label}, ${unread} unread` : t.label}
                    >
                      {on ? <BrandGradient style={s.segmentItem}>{label}</BrandGradient> : <View style={s.segmentItem}>{label}</View>}
                    </Pressable>
                  );
                })}
              </View>
            )}
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
              <Text style={s.emptyTitle}>{q ? 'No one by that name' : isVendor ? EMPTY[tab][0] : 'No conversations yet'}</Text>
              <Text style={s.emptyText}>{q ? '' : isVendor ? EMPTY[tab][1] : 'Message a vendor from their profile or a booking and it shows up here.'}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const o = other(item);
          return (
            <Pressable
              style={s.row}
              onPress={() => navigation.navigate('ChatDetail', { conversationId: item.id, participantName: nameOf(item), avatar: item.is_group ? undefined : o?.avatar })}
              accessibilityRole="button"
            >
              <View style={[s.avatar, item.is_group && s.groupAvatar]}>
                {item.is_group ? (
                  <Ionicons name="people" size={26} color={DARK.accent} />
                ) : o?.avatar ? (
                  <Image source={{ uri: o.avatar }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Text style={s.avatarText}>{(o?.name ?? '?')[0].toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[s.name, !!item.unread && { color: '#fff' }]} numberOfLines={1}>{nameOf(item)}</Text>
                <Text style={[s.preview, !!item.unread && s.previewUnread]} numberOfLines={1}>
                  {item.is_group && item.last_message?.sender_name ? `${item.last_message.sender_name.split(' ')[0]}: ` : ''}
                  {item.last_message?.content || (item.is_group ? `${item.member_count ?? 0} members` : 'No messages yet')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start', paddingTop: 4 }}>
                <Text style={[s.time, { paddingTop: 0 }]}>{when(item.updated_at)}</Text>
                {!!item.unread && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                  </View>
                )}
              </View>
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
  groupAvatar: { backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.border },
  previewUnread: { color: '#fff', fontFamily: FONTS.medium },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontFamily: FONTS.semibold },
  // the vendor Bookings screen's filter tabs
  segment: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 100, backgroundColor: DARK.card, gap: 2 },
  segmentItem: { height: 44, paddingHorizontal: 16, borderRadius: 100, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.medium },
  segmentBadge: { minWidth: 20, height: 20, borderRadius: 10 },
  segmentBadgeOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
});
