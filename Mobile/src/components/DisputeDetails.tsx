import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';
import { DISPUTE_CATEGORY_LABELS, disputeOutcomeText, type DisputeCategory } from '../services/payments.service';

export interface DisputeDetailFields {
  dispute_category?: string | null;
  dispute_outcome?: string | null;
  dispute_requested_amount?: number | string | null;
  /** short-lived signed links from the API */
  dispute_photo_urls?: string[] | null;
}

export const disputeCategoryText = (c?: string | null) => (c ? DISPUTE_CATEGORY_LABELS[c as DisputeCategory] ?? c : null);

/** Kind of problem, what the customer asks for, and their photos (tap one for full size). */
export default function DisputeDetails({ d, mine = false }: { d: DisputeDetailFields; mine?: boolean }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const category = disputeCategoryText(d.dispute_category);
  const outcome = disputeOutcomeText(d.dispute_outcome, d.dispute_requested_amount);
  const photos = d.dispute_photo_urls ?? [];
  if (!category && !outcome && photos.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {!!category && (
        <Text style={s.line}>
          <Text style={s.key}>Problem: </Text>
          {category}
        </Text>
      )}
      {!!outcome && (
        <Text style={s.line}>
          <Text style={s.key}>{mine ? 'You asked for: ' : 'Asks for: '}</Text>
          {outcome}
        </Text>
      )}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((url, i) => (
            <Pressable key={url} onPress={() => setViewing(url)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${photos.length}, open full size`}>
              <Image source={{ uri: url }} style={s.thumb} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={s.viewer}>
          {!!viewing && <Image source={{ uri: viewing }} style={s.full} resizeMode="contain" accessibilityLabel="Photo, full size" />}
          <Pressable onPress={() => setViewing(null)} style={s.close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  line: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  key: { color: DARK.muted, fontFamily: FONTS.regular },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: DARK.field },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 56, right: 20 },
});
