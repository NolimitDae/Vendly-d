import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import type { CustomerHomeStackParams } from '../../navigation/types';

interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string | null } | null;
}

interface Meta {
  total: number;
  page: number;
  last_page: number;
  avg_rating: number | null;
  distribution?: Record<string, number> | { rating: number; count: number }[];
}

export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={rating >= i - 0.25 ? 'star' : rating >= i - 0.75 ? 'star-half' : 'star'} size={size} color={rating >= i - 0.75 ? '#F5B700' : DARK.field} />
      ))}
    </View>
  );
}

export default function Reviews({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'Reviews'>) {
  const { listingId, title } = route.params;
  const insets = useSafeAreaInsets();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/reviews/listing/${listingId}`, { params: { page, limit: 20 } });
      setReviews((prev) => (page === 1 ? res.data?.data ?? [] : [...prev, ...(res.data?.data ?? [])]));
      setMeta(res.data?.meta ?? null);
    } catch {
      // nothing to show
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const dist = meta?.distribution;
  const countFor = (star: number) =>
    Array.isArray(dist) ? dist.find((d) => d.rating === star)?.count ?? 0 : Number(dist?.[String(star)] ?? 0);
  const maxCount = Math.max(1, ...[1, 2, 3, 4, 5].map(countFor));
  const avg = meta?.avg_rating ?? 0;

  return (
    <View style={s.root}>
      <FlatList
        data={reviews}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
        onEndReached={() => meta && meta.page < meta.last_page && load(meta.page + 1)}
        ListHeaderComponent={
          <View style={{ gap: 24, marginBottom: 8 }}>
            <ScreenHeader title="All Reviews" onBack={() => navigation.goBack()} />
            <Card style={s.summary}>
              <View style={{ gap: 8 }}>
                <Text style={s.avg}>{meta?.total ? avg.toFixed(1) : '–'}</Text>
                <Stars rating={avg} size={22} />
                <Text style={s.muted}>Based on {meta?.total ?? 0} review{meta?.total === 1 ? '' : 's'}</Text>
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                {[5, 4, 3, 2, 1].map((star) => (
                  <View key={star} style={s.barRow}>
                    <Text style={s.barLabel}>{star}</Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${(countFor(star) / maxCount) * 100}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
            <Text style={s.subtitle} numberOfLines={1}>{title}</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 32 }} />
          ) : (
            <Text style={[s.muted, { textAlign: 'center', marginTop: 32 }]}>No reviews yet. Book this service and be the first.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={s.review}>
            <View style={s.ratingRow}>
              <Text style={s.ratingText}>{Number(item.rating).toFixed(1)}</Text>
              <Stars rating={item.rating} />
            </View>
            <View style={s.meta}>
              <Ionicons name="calendar-outline" size={16} color="#fff" />
              <Text style={s.metaText}>{format(parseISO(item.created_at), 'dd MMM, yyyy')}</Text>
            </View>
            {!!item.comment && <Text style={s.comment}>{item.comment}</Text>}
            <View style={s.author}>
              <View style={s.avatar}>
                {item.author?.avatar_url ? <Image source={{ uri: item.author.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{item.author?.name?.[0]?.toUpperCase() ?? '?'}</Text>}
              </View>
              <Text style={s.authorName}>{item.author?.name ?? 'Vendly customer'}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  summary: { flexDirection: 'row', gap: 24, marginHorizontal: 20, padding: 20, alignItems: 'center' },
  avg: { color: '#fff', fontSize: 40, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium, width: 10, textAlign: 'right' },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: DARK.field, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3, backgroundColor: DARK.accent },
  subtitle: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium, paddingHorizontal: 20 },
  review: { paddingHorizontal: 20, paddingVertical: 20, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.field },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular },
  comment: { color: '#fff', fontSize: 15, lineHeight: 24, fontFamily: FONTS.regular },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  authorName: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
});
