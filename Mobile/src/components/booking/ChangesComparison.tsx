import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { comparisonRows, type Comparison } from '../../utils/requestChanges';

/**
 * The request before and after the vendor's suggested changes: date and time, guests, each add-on and
 * fee, the customizations, the total and the payment schedule. Changed rows are marked.
 */
export default function ChangesComparison({ comparison, vendorName }: { comparison: Comparison; vendorName?: string }) {
  const rows = comparisonRows(comparison);
  return (
    <View style={{ gap: 12 }}>
      {!!comparison.note && (
        <View style={s.note}>
          <Text style={s.noteLabel}>Note from {vendorName ?? 'the vendor'}</Text>
          <Text style={s.noteText}>{comparison.note}</Text>
        </View>
      )}
      <View style={s.table}>
        {rows.map((r, i) => {
          const changed = r.before !== r.after;
          return (
            <View
              key={r.label}
              style={[s.row, i > 0 && s.divider, changed && s.changed]}
              accessible
              accessibilityLabel={changed ? `${r.label}: ${r.before}, changes to ${r.after}` : `${r.label}: ${r.after}, unchanged`}
            >
              <Text style={[s.label, r.strong && s.strong]}>{r.label}</Text>
              {changed ? (
                <View style={{ gap: 2 }}>
                  <Text style={s.before}>{r.before}</Text>
                  <View style={s.afterRow}>
                    <Ionicons name="arrow-forward" size={13} color={DARK.accent} />
                    <Text style={[s.after, r.strong && s.strong]}>{r.after}</Text>
                  </View>
                </View>
              ) : (
                <Text style={[s.same, r.strong && s.strong]}>{r.after}</Text>
              )}
            </View>
          );
        })}
      </View>
      {!!comparison.promo_note && <Text style={s.warn}>{comparison.promo_note}</Text>}
      <Text style={s.muted}>Nothing is charged until the vendor accepts the request.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  note: { backgroundColor: DARK.field, borderRadius: 12, padding: 12, gap: 4 },
  noteLabel: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  noteText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  table: { borderRadius: 12, borderWidth: 1, borderColor: DARK.field, overflow: 'hidden' },
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  divider: { borderTopWidth: 1, borderTopColor: DARK.field },
  changed: { backgroundColor: 'rgba(252,211,77,0.08)' },
  label: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  before: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular, textDecorationLine: 'line-through' },
  afterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  after: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.semibold },
  same: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  strong: { fontFamily: FONTS.semibold, fontSize: 15 },
  warn: { color: '#fcd34d', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
});
