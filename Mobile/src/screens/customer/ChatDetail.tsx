import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { BrandGradient, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, toMessage, type Message } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { useAuth } from '../../context/AuthContext';

export default function ChatDetail() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { conversationId, participantName, avatar } = route.params as { conversationId: string; participantName: string; avatar?: string };
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await ChatService.getMessages(conversationId);
      if (res.data?.success) setMessages(res.data.data);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    let handler: (data: any) => void;
    (async () => {
      await SocketService.joinRoom(conversationId);
      handler = (data: any) => {
        // Socket events carry the raw API message ({ from, data }); translate like the REST responses.
        const raw = data?.data ?? data;
        const incoming = raw?.id ? toMessage(raw, conversationId) : null;
        if (!incoming) return;
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [incoming, ...prev]));
      };
      await SocketService.onMessage(handler);
    })();
    return () => {
      SocketService.offMessage(handler);
    };
  }, [conversationId, fetchMessages]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const res = await ChatService.sendMessage({ conversation_id: conversationId, content });
      if (res.data?.success) {
        const sent = res.data.data;
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [sent, ...prev]));
      }
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const Avatar = ({ uri, name }: { uri?: string; name: string }) => (
    <View style={s.avatar}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}>
        <ScreenHeader title={participantName} onBack={() => navigation.goBack()} />
      </View>

      {loading ? (
        <ActivityIndicator color={DARK.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 20 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>Say hello to {participantName.split(' ')[0]}. Keep booking details in Vendly so they're covered by your contract.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const me = item.sender_id === user?.id;
            const time = item.created_at ? format(parseISO(item.created_at), 'h:mm a') : '';
            return (
              <View style={[s.line, me && { flexDirection: 'row-reverse' }]}>
                {me ? <Avatar uri={user?.avatar_url} name={user?.name ?? 'Me'} /> : <Avatar uri={item.sender?.avatar ?? avatar} name={participantName} />}
                <View style={{ maxWidth: '72%', gap: 6, alignItems: me ? 'flex-end' : 'flex-start' }}>
                  {me ? (
                    <BrandGradient style={[s.bubble, s.bubbleMe]}>
                      <Text style={s.bubbleText}>{item.content}</Text>
                    </BrandGradient>
                  ) : (
                    <View style={[s.bubble, s.bubbleThem]}>
                      <Text style={s.bubbleText}>{item.content}</Text>
                    </View>
                  )}
                  {item.file && <Image source={{ uri: item.file }} style={s.attachment} />}
                  <Text style={s.time}>{time}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[s.inputBar, { marginBottom: insets.bottom + 12 }]}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={DARK.muted}
          multiline
          onSubmitEditing={send}
          blurOnSubmit
        />
        <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Send">
          <BrandGradient style={[s.send, !text.trim() && { opacity: 0.5 }]}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="paper-plane-outline" size={22} color="#fff" />}
          </BrandGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  empty: { transform: [{ scaleY: -1 }], paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold },
  bubble: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 24 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: DARK.card, borderTopLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 16, lineHeight: 24, fontFamily: FONTS.regular },
  attachment: { width: 200, height: 150, borderRadius: 16, backgroundColor: DARK.card },
  time: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 20, paddingLeft: 18, paddingRight: 6, paddingVertical: 6, borderRadius: 28, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.border },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 10 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
