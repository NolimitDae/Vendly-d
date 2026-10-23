import React, { useCallback, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { api } from '../services/api';
import { apiMessage } from '../screens/auth/SignIn';
import { haptic } from '../utils/haptics';

interface Pending {
  booking_id: string;
  listing: { id: string; title: string; image: string | null } | null;
  vendor: { id: string; name: string; avatar_url: string | null };
}

const WORDS = ['', 'Poor', 'Not great', 'Good', 'Great', 'Excellent'];

function Stars({ value, onPick, size = 30 }: { value: number; onPick: (n: number) => void; size?: number }) {
  return (
    <View style={s.stars} accessibilityRole="adjustable" accessibilityLabel={`Rating: ${value || 'none'} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onPick(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? '#fcd34d' : DARK.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/** "How was it?" for the most recent finished booking that hasn't been rated. Rate in two taps, or "Not now". */
export default function ReviewPrompt({ style }: { style?: StyleProp<ViewStyle> }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api
        .get('/reviews/pending')
        .then((res) => setItems(res.data?.data ?? []))
        .catch(() => {});
    }, []),
  );

  const current = items[0];
  if (!current) return null;
  const what = current.listing?.title ?? 'your booking';

  const next = () => {
    setItems((list) => list.slice(1));
    setRating(0);
    setComment('');
    setOpen(false);
  };

  const notNow = () => {
    api.post(`/reviews/pending/${current.booking_id}/dismiss`).catch(() => {});
    next();
  };

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await api.post('/reviews', { booking_id: current.booking_id, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      haptic.success();
      next();
      Alert.alert('Thanks for your review', `It helps others choose ${current.vendor.name}.`);
    } catch (e) {
      Alert.alert('Couldn’t send your review', apiMessage(e, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.card, style]}>
      <View style={s.row}>
        {current.listing?.image || current.vendor.avatar_url ? (
          <Image source={{ uri: (current.listing?.image ?? current.vendor.avatar_url)! }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.center]}>
            <Ionicons name="star-outline" size={20} color={DARK.accent} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>How was {current.vendor.name}?</Text>
          <Text style={s.sub} numberOfLines={1}>{what}</Text>
        </View>
        <Pressable onPress={notNow} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now">
          <Ionicons name="close" size={20} color={DARK.muted} />
        </Pressable>
      </View>
      <Stars
        value={rating}
        onPick={(n) => {
          haptic.tap();
          setRating(n);
          setOpen(true);
        }}
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Rate {current.vendor.name}</Text>
            <Text style={s.sub}>{what}</Text>
            <Stars value={rating} onPick={setRating} size={34} />
            <Text style={[s.sub, { textAlign: 'center' }]}>{WORDS[rating]}</Text>
            <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
              <TextInput
                style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="What went well? Anything to improve? (optional)"
                placeholderTextColor={DARK.muted}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={1000}
                accessibilityLabel="Your review"
              />
            </View>
            <GradientButton title="Send review" onPress={submit} loading={saving} disabled={!rating} />
            <Pressable onPress={() => setOpen(false)} style={{ alignSelf: 'center', padding: 6 }} accessibilityRole="button">
              <Text style={s.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: DARK.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK.field },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  sub: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  stars: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: DARK.bg, borderRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: DARK.border },
  sheetTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  cancel: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.medium },
});
