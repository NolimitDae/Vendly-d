import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Card, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { ReviewService, type VendorReview, type VendorReviewsMeta } from '../../services/review.service';
import { apiMessage } from '../auth/SignIn';
import { haptic } from '../../utils/haptics';

const PAGE_SIZE = 20;
const MAX = 2000;

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color={i <= Math.round(rating) ? '#fbbf24' : DARK.muted} />
      ))}
    </View>
  );
}

/** A vendor's reviews: average and count, each review, and a public reply (one per review). */
export default function VendorReviews() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [reviews, setReviews] = useState<VendorReview[]>([]);
  const [meta, setMeta] = useState<VendorReviewsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (page = 1) => {
    try {
      const res = await ReviewService.mine({ page, limit: PAGE_SIZE });
      const rows = res.data?.data ?? [];
      setReviews((prev) => (page === 1 ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setMeta(res.data?.meta ?? null);
      setFailed(false);
    } catch {
      if (page === 1) setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(1); }, [load]));

  const loadMore = () => {
    if (!meta || more || meta.page >= meta.last_page) return;
    setMore(true);
    load(meta.page + 1);
  };

  const replied = (id: string, reply: string) => {
    setReviews((list) => list.map((r) => (r.id === id ? { ...r, reply } : r)));
    setMeta((m) => (m ? { ...m, unanswered: Math.max(0, m.unanswered - 1) } : m));
  };

  return (
    <View style={s.root}>
      <FlatList
        data={reviews}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={DARK.accent} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <ScreenHeader title="Reviews" onBack={() => nav.goBack()} />
            {!!meta && meta.total > 0 && (
              <Card style={[s.summary, { marginHorizontal: 20 }]}>
                <Text style={s.avg}>{meta.avg_rating != null ? Number(meta.avg_rating).toFixed(1) : '–'}</Text>
                <View style={{ gap: 4, flex: 1 }}>
                  <Stars rating={Number(meta.avg_rating ?? 0)} size={18} />
                  <Text style={s.muted}>{meta.total} review{meta.total === 1 ? '' : 's'}</Text>
                  {meta.unanswered > 0 && <Text style={s.waiting}>{meta.unanswered} waiting for your reply</Text>}
                </View>
              </Card>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : failed ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>Couldn’t load your reviews.</Text>
              <Pressable onPress={() => { setLoading(true); load(1); }} hitSlop={8} accessibilityRole="button">
                <Text style={s.link}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="star-outline" size={44} color={DARK.muted} />
              <Text style={s.emptyTitle}>No reviews yet</Text>
              <Text style={s.emptyText}>Customers can rate you once a booking is complete. Their reviews show up here.</Text>
            </View>
          )
        }
        ListFooterComponent={more ? <ActivityIndicator color={DARK.accent} /> : null}
        renderItem={({ item }) => <ReviewCard review={item} onReplied={replied} />}
      />
    </View>
  );
}

function ReviewCard({ review: r, onReplied }: { review: VendorReview; onReplied: (id: string, reply: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const name = r.author?.name || 'Customer';

  const send = async () => {
    const reply = text.trim();
    if (reply.length < 2) return;
    setSaving(true);
    try {
      await ReviewService.reply(r.id, reply);
      haptic.success();
      setOpen(false);
      onReplied(r.id, reply);
    } catch (e) {
      Alert.alert('Couldn’t post your reply', apiMessage(e, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: 10, marginHorizontal: 20 }}>
      <View style={s.row}>
        <View style={s.avatar}>
          {r.author?.avatar_url ? <Image source={{ uri: r.author.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{name[0]?.toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Stars rating={r.rating} />
        </View>
        <Text style={s.muted}>{format(parseISO(r.created_at), 'MMM d, yyyy')}</Text>
      </View>
      {!!r.listing?.title && <Text style={s.muted} numberOfLines={1}>{r.listing.title}</Text>}
      {r.comment ? <Text style={s.body}>{r.comment}</Text> : <Text style={[s.muted, { fontStyle: 'italic' }]}>No written review</Text>}

      {r.reply ? (
        <View style={s.reply}>
          <Text style={s.replyLabel}>Your reply</Text>
          <Text style={s.body}>{r.reply}</Text>
        </View>
      ) : open ? (
        <View style={{ gap: 8 }}>
          <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
            <TextInput
              style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Thank them, or answer what they said"
              placeholderTextColor={DARK.muted}
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX))}
              multiline
              autoFocus
              accessibilityLabel={`Reply to ${name}`}
            />
          </View>
          <Text style={s.muted}>Everyone who views your profile sees this. You can reply once, and it can’t be changed later.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={s.outline} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={s.outlineText}>Cancel</Text>
            </Pressable>
            <GradientButton title="Post reply" onPress={send} loading={saving} disabled={text.trim().length < 2} style={{ flex: 1.3 }} />
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" style={s.replyBtn}>
          <Ionicons name="return-down-forward-outline" size={18} color={DARK.accent} />
          <Text style={s.link}>Reply</Text>
        </Pressable>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avg: { color: '#fff', fontSize: 40, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  waiting: { color: '#fcd34d', fontSize: 13, fontFamily: FONTS.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  name: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  body: { color: DARK.text, fontSize: 14, fontFamily: FONTS.regular, lineHeight: 20 },
  reply: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: DARK.field },
  replyLabel: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.semibold },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center' },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
