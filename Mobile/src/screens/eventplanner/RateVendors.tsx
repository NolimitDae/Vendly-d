import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { ReviewService, type EventVendorReview, type EventVendorReviews } from '../../services/review.service';
import { apiError } from '../../services/contracts.service';
import type { EventPlannerStackParams } from '../../navigation/types';

const WORDS = ['', 'Poor', 'Not great', 'Good', 'Great', 'Excellent'];

/** "Rate your vendors": every completed booking on the event in one place; rated ones shown, the rest rateable here. */
export default function RateVendors({ navigation, route }: NativeStackScreenProps<EventPlannerStackParams, 'RateVendors'>) {
  const { eventId, eventName } = route.params;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<EventVendorReviews | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ReviewService.forEvent(eventId)
      .then((r) => setData(r.data.data))
      .catch((e) => setError(apiError(e, "We couldn't load this event's vendors.")));
  }, [eventId]);

  // a review just sent: show it as done and count one fewer to rate
  const reviewed = useCallback(
    (bookingId: string, review: NonNullable<EventVendorReview['review']>) =>
      setData((d) => (d ? { ...d, to_rate: Math.max(0, d.to_rate - 1), items: d.items.map((i) => (i.booking_id === bookingId ? { ...i, review } : i)) } : d)),
    [],
  );

  const total = data?.items.length ?? 0;
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Rate your vendors" onBack={() => navigation.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {error ? (
            <Text style={s.muted}>{error}</Text>
          ) : !data ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={{ gap: 2 }}>
                <Text style={s.eventName}>{data.event.name || eventName}</Text>
                {total > 0 && <Text style={s.muted}>{data.to_rate === 0 ? 'All done. Thanks for rating everyone.' : `${total - data.to_rate} of ${total} rated`}</Text>}
              </View>
              {total === 0 ? (
                <View style={s.card}>
                  <Ionicons name="star-outline" size={32} color={DARK.muted} style={{ alignSelf: 'center' }} />
                  <Text style={[s.muted, { textAlign: 'center' }]}>Nothing to rate yet. Vendors show up here once their booking on this event is completed.</Text>
                </View>
              ) : (
                data.items.map((item) => <VendorCard key={item.booking_id} item={item} onReviewed={reviewed} />)
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VendorCard({ item, onReviewed }: { item: EventVendorReview; onReviewed: (bookingId: string, review: NonNullable<EventVendorReview['review']>) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const { vendor, listing, review } = item;
  const what = [listing?.category, listing?.title].filter(Boolean).join(' · ');

  const send = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      const text = comment.trim();
      const res = await ReviewService.create({ booking_id: item.booking_id, rating, ...(text ? { comment: text } : {}) });
      onReviewed(item.booking_id, { id: res.data?.data?.id ?? '', rating, comment: text || null, created_at: res.data?.data?.created_at ?? new Date().toISOString() });
    } catch (e) {
      Alert.alert("Couldn't send your review", apiError(e, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.card, !review && s.cardOpen]} accessibilityLabel={vendor.name}>
      <View style={s.head}>
        {vendor.avatar_url ? (
          <Image source={{ uri: vendor.avatar_url }} style={s.avatar} />
        ) : (
          <View style={s.avatar}><Text style={s.avatarText}>{vendor.name[0]?.toUpperCase()}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{vendor.name}</Text>
          {!!what && <Text style={s.muted} numberOfLines={1}>{what}</Text>}
        </View>
        {review && (
          <View style={s.done}>
            <Ionicons name="checkmark-circle" size={16} color="#6ee7c7" />
            <Text style={s.doneText}>Reviewed</Text>
          </View>
        )}
      </View>

      {review ? (
        <>
          <View style={s.stars} accessibilityLabel={`Rated ${review.rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= review.rating ? 'star' : 'star-outline'} size={20} color={n <= review.rating ? '#fcd34d' : DARK.muted} />)}
          </View>
          {!!review.comment && <Text style={s.body}>{review.comment}</Text>}
        </>
      ) : (
        <>
          <View style={s.stars} accessibilityRole="adjustable" accessibilityLabel={`Your rating for ${vendor.name}: ${rating || 'none'} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={n <= rating ? '#fcd34d' : DARK.muted} />
              </Pressable>
            ))}
            {rating > 0 && <Text style={[s.muted, { marginLeft: 6 }]}>{WORDS[rating]}</Text>}
          </View>
          <TextInput
            style={s.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Write a quick review (optional)"
            placeholderTextColor={DARK.muted}
            multiline
            maxLength={1000}
            accessibilityLabel={`Your review of ${vendor.name}`}
          />
          <GradientButton title="Send review" onPress={send} loading={saving} disabled={!rating} />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  eventName: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  cardOpen: { borderWidth: 1, borderColor: DARK.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  name: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  body: { color: '#fff', fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { color: '#6ee7c7', fontSize: 12, fontFamily: FONTS.medium },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { minHeight: 72, borderRadius: 16, backgroundColor: DARK.field, color: '#fff', padding: 12, fontSize: 14, fontFamily: FONTS.regular, textAlignVertical: 'top' },
});
