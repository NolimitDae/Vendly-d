import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Chip, GradientButton, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import {
  DISPUTE_CATEGORY_LABELS,
  DISPUTE_MAX_PHOTOS,
  DISPUTE_OUTCOME_LABELS,
  PaymentsService,
  type DisputeCategory,
  type DisputeOutcome,
} from '../services/payments.service';
import { apiMessage } from '../screens/auth/SignIn';

const MIN = 10;
const MAX = 2000;

type Photo = { uri: string; name: string; type: string };

/**
 * The customer's report: kind of problem, what happened, up to 10 photos, and what they'd like.
 * `limit` (the vendor's part of what was paid, from newer APIs) keeps a partial refund under what
 * Vendly can grant; `category` preselects the kind of problem (a no-show).
 */
export default function ReportProblemForm({ bookingId, paid, limit, category: initialCategory, onCancel, onSent }: { bookingId: string; paid: number; limit?: number | null; category?: DisputeCategory; onCancel: () => void; onSent: () => void }) {
  const [category, setCategory] = useState<DisputeCategory | null>(initialCategory ?? null);
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [outcome, setOutcome] = useState<DisputeOutcome>('full_refund');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const pick = async () => {
    const room = DISPUTE_MAX_PHOTOS - photos.length;
    if (room <= 0) return void Alert.alert(`Up to ${DISPUTE_MAX_PHOTOS} photos`, `You can add up to ${DISPUTE_MAX_PHOTOS} photos.`);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled || !res.assets?.length) return;
    const picked = res.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `problem_${Date.now()}_${i}.jpg`, type: a.mimeType ?? 'image/jpeg' }));
    setPhotos((prev) => {
      const next = [...prev, ...picked.filter((p) => !prev.some((q) => q.uri === p.uri))];
      if (next.length > DISPUTE_MAX_PHOTOS) Alert.alert(`Up to ${DISPUTE_MAX_PHOTOS} photos`, `Only the first ${DISPUTE_MAX_PHOTOS} were added.`);
      return next.slice(0, DISPUTE_MAX_PHOTOS);
    });
  };

  const requested = Number(amount);
  const cap = limit ?? null;
  const amountError =
    outcome !== 'partial_refund'
      ? ''
      : !(requested > 0)
        ? 'Enter how much you’d like back.'
        : cap !== null && requested >= cap
          ? `A partial refund must be less than $${cap.toFixed(2)}, the vendor’s part of what you’ve paid. To ask for everything back, choose a full refund.`
          : cap === null && requested > paid
            ? `You can ask for up to $${paid.toFixed(2)}, what you’ve paid.`
            : '';
  const valid = !!category && reason.trim().length >= MIN && !amountError;

  const send = async () => {
    if (!valid || !category) return;
    setSending(true);
    try {
      await PaymentsService.dispute(bookingId, {
        reason: reason.trim(),
        category,
        outcome,
        requested_amount: outcome === 'partial_refund' ? Math.round(requested * 100) / 100 : undefined,
        photos,
      });
      onSent();
    } catch (e) {
      Alert.alert('Couldn’t send your report', apiMessage(e, 'Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={s.label}>What went wrong?</Text>
      <View style={s.wrap}>
        {(Object.keys(DISPUTE_CATEGORY_LABELS) as DisputeCategory[]).map((c) => (
          <Chip key={c} label={DISPUTE_CATEGORY_LABELS[c]} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>

      <Text style={s.label}>Tell us what happened</Text>
      <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
        <TextInput
          style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]}
          placeholder="What happened, when, and anything Vendly should know (at least 10 characters)"
          placeholderTextColor={DARK.muted}
          value={reason}
          onChangeText={(t) => setReason(t.slice(0, MAX))}
          multiline
          accessibilityLabel="What happened"
        />
      </View>

      <Text style={s.label}>Photos (optional, up to {DISPUTE_MAX_PHOTOS})</Text>
      <View style={s.wrap}>
        {photos.map((p, i) => (
          <View key={p.uri}>
            <Image source={{ uri: p.uri }} style={s.thumb} accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable onPress={() => setPhotos((prev) => prev.filter((q) => q.uri !== p.uri))} style={s.remove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photos.length < DISPUTE_MAX_PHOTOS && (
          <Pressable onPress={pick} style={s.add} accessibilityRole="button" accessibilityLabel="Add photos">
            <Ionicons name="image-outline" size={22} color={DARK.muted} />
            <Text style={s.addText}>Add</Text>
          </Pressable>
        )}
      </View>

      <Text style={s.label}>What would you like?</Text>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        {(Object.keys(DISPUTE_OUTCOME_LABELS) as DisputeOutcome[]).map((o) => (
          <Pressable key={o} onPress={() => setOutcome(o)} style={s.radioRow} accessibilityRole="radio" accessibilityState={{ checked: outcome === o }}>
            <Ionicons name={outcome === o ? 'radio-button-on' : 'radio-button-off'} size={20} color={outcome === o ? DARK.accent : DARK.muted} />
            <Text style={s.radioText}>{DISPUTE_OUTCOME_LABELS[o]}</Text>
          </Pressable>
        ))}
      </View>
      {outcome === 'partial_refund' && (
        <View style={{ gap: 6 }}>
          <View style={[ui.field, { height: 48 }]}>
            <Text style={s.dollar}>$</Text>
            <TextInput
              style={ui.input}
              keyboardType="decimal-pad"
              placeholder={cap !== null ? `Less than ${cap.toFixed(2)}` : `Up to ${paid.toFixed(2)}`}
              placeholderTextColor={DARK.muted}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
              accessibilityLabel={cap !== null ? `Amount, less than $${cap.toFixed(2)}` : `Amount, up to $${paid.toFixed(2)}`}
            />
          </View>
          {amount !== '' && !!amountError && <Text style={s.error}>{amountError}</Text>}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable style={s.outline} onPress={onCancel}>
          <Text style={s.outlineText}>Cancel</Text>
        </Pressable>
        <GradientButton title="Send report" onPress={send} loading={sending} disabled={!valid} style={{ flex: 1.3 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: DARK.field },
  remove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  add: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: DARK.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  radioText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  dollar: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.medium, marginRight: 4 },
  error: { color: '#fca5a5', fontSize: 12, fontFamily: FONTS.regular },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
