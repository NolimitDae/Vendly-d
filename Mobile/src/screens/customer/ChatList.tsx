import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { ChatService, Conversation } from '../../services/chat.service';
import { useAuth } from '../../context/AuthContext';

export default function ChatList() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await ChatService.getConversations();
      if (res.data?.success) setConversations(res.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const getOtherParticipant = (conv: Conversation) =>
    conv.participants.find((p) => p.id !== user?.id) ?? conv.participants[0];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={s.center}>
        <Ionicons name="chatbubbles-outline" size={56} color={COLORS.gray[300]} />
        <Text style={s.emptyTitle}>No conversations yet</Text>
        <Text style={s.emptySub}>Start a conversation by booking a vendor</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={s.root}
      data={conversations}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={s.sep} />}
      renderItem={({ item }) => {
        const other = getOtherParticipant(item);
        const initials = (other?.name ?? '?')
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        return (
          <TouchableOpacity
            style={s.row}
            onPress={() =>
              navigation.navigate('ChatDetail', {
                conversationId: item.id,
                participantName: other?.name ?? 'User',
              })
            }
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={s.info}>
              <View style={s.topRow}>
                <Text style={s.name} numberOfLines={1}>{other?.name ?? 'User'}</Text>
                {item.updated_at ? (
                  <Text style={s.time}>{formatTime(item.updated_at)}</Text>
                ) : null}
              </View>
              <Text style={s.preview} numberOfLines={1}>
                {item.last_message?.content ?? 'No messages yet'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.gray[700], marginTop: 16 },
  emptySub: { fontSize: 13, color: COLORS.gray[400], marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
  sep: { height: 1, backgroundColor: COLORS.gray[100], marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: COLORS.gray[400] },
  preview: { fontSize: 13, color: COLORS.gray[500] },
});
