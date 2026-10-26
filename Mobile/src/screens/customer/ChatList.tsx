import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, parseISO } from 'date-fns';
import { BrandGradient } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, type Conversation, type InboxCounts, type InboxTab } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { apiError } from '../../services/contracts.service';
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
  // chats I archived: the "Archived (n)" row opens them here, in place of the main list
  const [archivedCount, setArchivedCount] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  // a slow answer for the tab just left must not replace the new tab's list
  const latest = useRef(0);
  const listRef = useRef(conversations);
  listRef.current = conversations;

  const load = useCallback(async () => {
    const call = ++latest.current;
    try {
      if (showArchived) {
        const res = await ChatService.getArchived();
        if (call !== latest.current) return;
        if (res.success) {
          setConversations(res.conversations);
          setArchivedCount(res.archived_count);
        }
      } else if (isVendor) {
        const res = await ChatService.getInboxTab(tab);
        if (call !== latest.current) return;
        if (res.success) {
          setConversations(res.conversations);
          setCounts(res.counts);
          setArchivedCount(res.archived_count);
        }
      } else {
        const res = await ChatService.getConversations();
        if (call !== latest.current) return;
        if (res.data?.success) {
          setConversations(res.data.data);
          setArchivedCount(res.archived_count);
        }
      }
    } catch {
      // keep what we have
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [isVendor, tab, showArchived]);

  const openArchived = (open: boolean) => {
    setConversations([]);
    setLoading(true);
    setShowArchived(open);
  };

  // Archiving is for me only, and a new message brings the chat back. The server says when it can't be
  // archived yet (a booking with them is under way).
  const setArchived = async (c: Conversation, archive: boolean) => {
    try {
      await (archive ? ChatService.archive(c.id) : ChatService.unarchive(c.id));
    } catch (e) {
      Alert.alert(archive ? 'Could not archive this chat' : 'Could not unarchive this chat', apiError(e));
      return;
    }
    setConversations((list) => list.filter((x) => x.id !== c.id));
    setArchivedCount((n) => Math.max(0, n + (archive ? 1 : -1)));
    // fresh tab counts
    load();
  };

  const rowOptions = (c: Conversation) =>
    Alert.alert(nameOf(c), undefined, [
      { text: showArchived ? 'Unarchive chat' : 'Archive chat', onPress: () => setArchived(c, !showArchived) },
      { text: 'Cancel', style: 'cancel' },
    ]);

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
            {showArchived ? (
              <View style={s.archivedHead}>
                <Pressable onPress={() => openArchived(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to all chats" style={s.backBtn}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { textAlign: 'left' }]}>Archived chats</Text>
                  <Text style={s.archivedHint}>Only hidden for you. A new message brings a chat back.</Text>
                </View>
              </View>
            ) : (
              <Text style={s.title}>Message</Text>
            )}
            {isVendor && !showArchived && (
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
              <Text style={s.emptyTitle}>{q ? 'No one by that name' : showArchived ? 'No archived chats' : isVendor ? EMPTY[tab][0] : 'No conversations yet'}</Text>
              <Text style={s.emptyText}>
                {q ? '' : showArchived ? 'Long press a chat to archive it.' : isVendor ? EMPTY[tab][1] : 'Message a vendor from their profile or a booking and it shows up here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          !showArchived && !loading && archivedCount > 0 ? (
            <Pressable style={s.archivedRow} onPress={() => openArchived(true)} accessibilityRole="button" accessibilityLabel={`Archived chats, ${archivedCount}`}>
              <Ionicons name="archive-outline" size={20} color={DARK.muted} />
              <Text style={s.archivedText}>Archived ({archivedCount})</Text>
              <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const o = other(item);
          const action = showArchived ? 'Unarchive chat' : 'Archive chat';
          return (
            <Pressable
              style={s.row}
              onPress={() => navigation.navigate('ChatDetail', { conversationId: item.id, participantName: nameOf(item), avatar: item.is_group ? undefined : o?.avatar })}
              onLongPress={() => rowOptions(item)}
              accessibilityRole="button"
              accessibilityLabel={nameOf(item)}
              accessibilityHint={`Long press to ${action.toLowerCase()}`}
              accessibilityActions={[{ name: 'archive', label: action }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === 'archive' && setArchived(item, !showArchived)}
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
              {showArchived ? (
                <Pressable onPress={() => setArchived(item, false)} hitSlop={6} style={s.unarchiveBtn} accessibilityRole="button" accessibilityLabel={`Unarchive chat with ${nameOf(item)}`}>
                  <Text style={s.unarchiveText}>Unarchive</Text>
                </Pressable>
              ) : (
                <View style={{ alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start', paddingTop: 4 }}>
                  <Text style={[s.time, { paddingTop: 0 }]}>{when(item.updated_at)}</Text>
                  {!!item.unread && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                    </View>
                  )}
                </View>
              )}
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
  // archived chats
  archivedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  archivedHint: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular, marginTop: 2 },
  archivedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 8, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.border },
  archivedText: { flex: 1, color: DARK.muted, fontSize: 16, fontFamily: FONTS.medium },
  unarchiveBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  unarchiveText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
