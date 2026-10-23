import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { BrandGradient, ScreenHeader } from '../../components/brand';
import QuoteCard from '../../components/chat/QuoteCard';
import SendQuoteSheet from '../../components/chat/SendQuoteSheet';
import { createTypingEmitter, typingLabel, useTypingUsers } from '../../components/chat/presence';
import { DARK, FONTS } from '../../constants/colors';
import { ChatService, CONTACT_WARNING, sharesContact, toMessage, type ConversationInfo, type Message, type Quote } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { apiError } from '../../services/contracts.service';
import { useAuth } from '../../context/AuthContext';

export default function ChatDetail() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { conversationId, participantName, avatar } = route.params as { conversationId: string; participantName: string; avatar?: string };
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await ChatService.getMessages(conversationId);
      if (res.data?.success) {
        setMessages(res.data.data);
        setInfo(res.data.conversation);
      }
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Only counts as read while someone can see it: in the background (or under another screen) it
  // waits until the app is active and this chat is in front again.
  const unseen = useRef(false);
  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active' || !navigation.isFocused()) {
      unseen.current = true;
      return;
    }
    unseen.current = false;
    ChatService.markRead(conversationId).catch(() => {});
  }, [conversationId, navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && unseen.current) markRead();
    });
    return () => sub.remove();
  }, [markRead]);

  useFocusEffect(
    useCallback(() => {
      if (unseen.current) markRead();
    }, [markRead]),
  );

  // Typing indicator: who else is typing, and throttled typing / stopTyping events from me
  const typers = useTypingUsers(conversationId, user?.id);
  const typing = useMemo(
    () => createTypingEmitter((on) => (on ? SocketService.emitTyping(conversationId) : SocketService.emitStopTyping(conversationId))),
    [conversationId],
  );
  useEffect(() => () => typing.stop(), [typing]);

  useEffect(() => {
    fetchMessages().then(markRead);
    const onMessage = (data: any) => {
      // Socket events carry the raw API message ({ from, data }); translate like the REST responses.
      const raw = data?.data ?? data;
      // the socket may still be in rooms of chats opened earlier
      if (raw?.conversation_id && raw.conversation_id !== conversationId) return;
      const incoming = raw?.id ? toMessage(raw, conversationId) : null;
      if (!incoming) return;
      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [incoming, ...prev]));
      if (incoming.sender_id !== user?.id) markRead();
    };
    const onRead = (e: { conversation_id: string; user_id: string; read_at: string }) => {
      if (e.conversation_id !== conversationId) return;
      setInfo((i) => (i ? { ...i, participants: i.participants.map((p) => (p.id === e.user_id ? { ...p, last_read_at: e.read_at } : p)) } : i));
    };
    const onPinned = (e: { conversation_id: string; message: any }) => {
      if (e.conversation_id !== conversationId) return;
      setInfo((i) => (i ? { ...i, pinned: e.message ? toMessage(e.message, conversationId) : null } : i));
    };
    const onQuote = (e: { quote_id: string; status: Quote['status'] }) => {
      setMessages((prev) => prev.map((m) => (m.quote?.id === e.quote_id ? { ...m, quote: { ...m.quote, status: e.status } } : m)));
    };
    // rooms don't survive a reconnect, so join again each time the socket (re)connects
    const join = () => SocketService.joinRoom(conversationId);
    (async () => {
      await join();
      await SocketService.on('connect', join);
      await SocketService.onMessage(onMessage);
      await SocketService.on('conversationRead', onRead);
      await SocketService.on('pinned', onPinned);
      await SocketService.on('quoteUpdated', onQuote);
    })();
    return () => {
      SocketService.off('connect', join);
      SocketService.offMessage(onMessage);
      SocketService.off('conversationRead', onRead);
      SocketService.off('pinned', onPinned);
      SocketService.off('quoteUpdated', onQuote);
    };
  }, [conversationId, fetchMessages, markRead, user?.id]);

  const doSend = async (content: string) => {
    typing.stop();
    setSending(true);
    setText('');
    try {
      const res = await ChatService.sendMessage({ conversation_id: conversationId, content });
      if (res.data?.success) {
        const sent = res.data.data;
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [sent, ...prev]));
        setWarning(res.data.warning?.text ?? null);
      }
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const content = text.trim();
    if (!content || sending) return;
    if (sharesContact(content)) {
      Alert.alert('Keep it in Vendly', CONTACT_WARNING, [
        { text: 'Edit message', style: 'cancel' },
        { text: 'Send anyway', onPress: () => doSend(content) },
      ]);
      return;
    }
    doSend(content);
  };

  const pin = (m: Message | null) =>
    ChatService.pin(conversationId, m?.id ?? null)
      .then(() => setInfo((i) => (i ? { ...i, pinned: m } : i)))
      .catch((e) => Alert.alert('Could not pin', apiError(e)));

  const onLongPress = (m: Message) => {
    if (m.kind === 'system') return;
    const isPinned = info?.pinned?.id === m.id;
    Alert.alert('Message', m.content.slice(0, 80), [
      { text: isPinned ? 'Unpin' : 'Pin for everyone', onPress: () => pin(isPinned ? null : m) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const acceptQuote = (m: Message) => {
    const q = m.quote;
    if (!q?.listing) return;
    // the normal booking flow (date, details, contract) at the quoted price
    navigation.navigate('HomeTab', {
      screen: 'SelectDate',
      initial: false,
      params: {
        listing: {
          id: q.listing.id,
          title: q.listing.title,
          price: q.amount,
          image: q.listing.image ?? undefined,
          vendorId: q.vendor_id,
          vendorName: m.sender?.name ?? participantName,
          quoteId: q.id,
          quoteTitle: q.title,
          eventId: q.event_id ?? undefined,
        },
      },
    });
  };

  const quoteAction = async (q: Quote, action: 'decline' | 'withdraw') => {
    setBusyQuote(q.id);
    try {
      await (action === 'decline' ? ChatService.declineQuote(q.id) : ChatService.withdrawQuote(q.id));
      setMessages((prev) => prev.map((m) => (m.quote?.id === q.id ? { ...m, quote: { ...q, status: action === 'decline' ? 'DECLINED' : 'WITHDRAWN' } } : m)));
    } catch (e) {
      Alert.alert('Quote', apiError(e));
    } finally {
      setBusyQuote(null);
    }
  };

  // read receipt under my most recent message
  const receipt = useMemo(() => {
    const mine = messages.find((m) => m.sender_id === user?.id && m.kind !== 'system');
    if (!mine || !info) return null;
    const others = info.participants.filter((p) => p.id !== user?.id);
    const sentAt = new Date(mine.created_at).getTime();
    const readers = others.filter((p) => p.last_read_at && new Date(p.last_read_at).getTime() >= sentAt);
    if (!readers.length) return { id: mine.id, label: 'Sent' };
    if (!info.is_group) return { id: mine.id, label: 'Seen' };
    return { id: mine.id, label: readers.length === others.length ? 'Seen by everyone' : `Seen by ${readers.map((r) => r.name.split(' ')[0]).join(', ')}` };
  }, [messages, info, user?.id]);

  const isGroup = !!info?.is_group;
  const title = isGroup ? info?.title ?? 'Event chat' : participantName;
  const memberLine = isGroup ? info?.participants.map((p) => (p.id === user?.id ? 'You' : p.name.split(' ')[0])).join(', ') : null;
  const isVendor = user?.type === 'VENDOR';

  const Avatar = ({ uri, name }: { uri?: string; name: string }) => (
    <View style={s.avatar}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>}
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} />
        {!!memberLine && <Text style={s.members} numberOfLines={1}>{memberLine}</Text>}
      </View>

      {info?.pinned && (
        <Pressable style={s.pinned} onLongPress={() => pin(null)} accessibilityRole="button" accessibilityHint="Long press to unpin">
          <Ionicons name="pin" size={16} color={DARK.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.pinnedLabel}>Pinned{info.pinned.sender ? ` · ${info.pinned.sender.name}` : ''}</Text>
            <Text style={s.pinnedText} numberOfLines={1}>{info.pinned.kind === 'quote' ? `Quote: ${info.pinned.quote?.title ?? ''}` : info.pinned.content}</Text>
          </View>
          <Pressable onPress={() => pin(null)} hitSlop={8} accessibilityLabel="Unpin">
            <Ionicons name="close" size={18} color={DARK.muted} />
          </Pressable>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={DARK.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 18 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>{isGroup ? 'Everyone working on this event can talk here.' : `Say hello to ${participantName.split(' ')[0]}.`} Keep booking details in Vendly so they're covered by your contract.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'system') {
              return <Text style={s.system}>{item.content}</Text>;
            }
            const me = item.sender_id === user?.id;
            const time = item.created_at ? format(parseISO(item.created_at), 'h:mm a') : '';
            const senderName = item.sender?.name ?? participantName;
            return (
              <Pressable onLongPress={() => onLongPress(item)} delayLongPress={350} style={[s.line, me && { flexDirection: 'row-reverse' }]}>
                {me ? <Avatar uri={user?.avatar_url} name={user?.name ?? 'Me'} /> : <Avatar uri={item.sender?.avatar ?? (isGroup ? undefined : avatar)} name={senderName} />}
                <View style={{ maxWidth: '78%', gap: 6, alignItems: me ? 'flex-end' : 'flex-start' }}>
                  {isGroup && !me && <Text style={s.senderName}>{senderName}</Text>}
                  {item.kind === 'quote' && item.quote ? (
                    <QuoteCard
                      quote={item.quote}
                      role={item.quote.customer_id === user?.id ? 'customer' : item.quote.vendor_id === user?.id ? 'vendor' : 'other'}
                      busy={busyQuote === item.quote.id}
                      onAccept={() => acceptQuote(item)}
                      onDecline={() => quoteAction(item.quote!, 'decline')}
                      onWithdraw={() => quoteAction(item.quote!, 'withdraw')}
                    />
                  ) : me ? (
                    <BrandGradient style={[s.bubble, s.bubbleMe]}>
                      <Text style={s.bubbleText}>{item.content}</Text>
                    </BrandGradient>
                  ) : (
                    <View style={[s.bubble, s.bubbleThem]}>
                      <Text style={s.bubbleText}>{item.content}</Text>
                    </View>
                  )}
                  {item.file && <Image source={{ uri: item.file }} style={s.attachment} />}
                  <Text style={s.time}>
                    {info?.pinned?.id === item.id ? '📌 ' : ''}
                    {time}
                    {receipt?.id === item.id ? ` · ${receipt.label}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {!!warning && (
        <Pressable style={s.warning} onPress={() => setWarning(null)} accessibilityRole="button" accessibilityHint="Dismiss">
          <Ionicons name="shield-checkmark-outline" size={18} color="#F5B700" />
          <Text style={s.warningText}>{warning}</Text>
          <Ionicons name="close" size={16} color={DARK.muted} />
        </Pressable>
      )}

      <Text style={s.typing} numberOfLines={1} accessibilityLiveRegion="polite">{typingLabel(typers) ?? ''}</Text>

      <View style={[s.inputBar, { marginBottom: insets.bottom + 12 }]}>
        {isVendor && (
          <Pressable onPress={() => setQuoting(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Send a quote" style={s.plus}>
            <Ionicons name="pricetags-outline" size={20} color={DARK.accent} />
          </Pressable>
        )}
        <TextInput
          style={s.input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (v.trim()) typing.input();
            else typing.stop();
          }}
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
      {isVendor && <SendQuoteSheet visible={quoting} conversationId={conversationId} onClose={() => setQuoting(false)} onSent={fetchMessages} />}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  members: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular, textAlign: 'center', marginTop: -2, paddingHorizontal: 70 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.field },
  pinnedLabel: { color: DARK.accent, fontSize: 11, fontFamily: FONTS.semibold },
  pinnedText: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular },
  empty: { transform: [{ scaleY: -1 }], paddingVertical: 40, paddingHorizontal: 20 },
  emptyText: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, textAlign: 'center' },
  system: { alignSelf: 'center', color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium, backgroundColor: DARK.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden', textAlign: 'center', maxWidth: '85%' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold },
  senderName: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.semibold },
  bubble: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 24 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: DARK.card, borderTopLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 16, lineHeight: 24, fontFamily: FONTS.regular },
  attachment: { width: 200, height: 150, borderRadius: 16, backgroundColor: DARK.card },
  time: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  typing: { color: DARK.accent, fontSize: 12, lineHeight: 16, minHeight: 16, fontFamily: FONTS.medium, marginHorizontal: 28, marginBottom: 6 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: 'rgba(245,183,0,0.12)' },
  warningText: { flex: 1, color: '#F7E2A0', fontSize: 12, lineHeight: 17, fontFamily: FONTS.medium },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 20, paddingLeft: 10, paddingRight: 6, paddingVertical: 6, borderRadius: 28, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.border },
  plus: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 10, paddingLeft: 6 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
