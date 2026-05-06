import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { ChatService, Message } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { useAuth } from '../../context/AuthContext';

export default function ChatDetail() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { conversationId, participantName } = route.params as {
    conversationId: string;
    participantName: string;
  };
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await ChatService.getMessages(conversationId);
      if (res.data?.success) setMessages(res.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    navigation.setOptions({ title: participantName });
    fetchMessages();

    let messageHandler: (data: any) => void;

    (async () => {
      await SocketService.joinRoom(conversationId);

      messageHandler = (data: any) => {
        const incoming: Message = data?.data ?? data;
        if (!incoming?.id) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
      };

      await SocketService.onMessage(messageHandler);
    })();

    return () => {
      SocketService.offMessage(messageHandler);
    };
  }, [conversationId, fetchMessages, navigation, participantName]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      const res = await ChatService.sendMessage({ conversation_id: conversationId, content });
      if (res.data?.success) {
        const sent = res.data.data;
        setMessages((prev) =>
          prev.some((m) => m.id === sent.id) ? prev : [sent, ...prev],
        );
      }
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
        <Text style={[s.bubbleText, isMe ? s.bubbleTextMe : s.bubbleTextThem]}>
          {item.content}
        </Text>
        <Text style={[s.bubbleTime, isMe ? s.bubbleTimeMe : s.bubbleTimeThem]}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>No messages yet. Say hello!</Text>
          </View>
        }
      />
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.gray[400]}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="send" size={18} color={COLORS.white} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  bubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  bubbleMe: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: COLORS.white, alignSelf: 'flex-start', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: COLORS.white },
  bubbleTextThem: { color: COLORS.gray[900] },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  bubbleTimeThem: { color: COLORS.gray[400] },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: COLORS.gray[400] },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray[100] },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: COLORS.gray[900], marginRight: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.gray[300] },
});
