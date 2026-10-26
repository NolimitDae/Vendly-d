import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { MAX_DOS, MAX_DO_LENGTH, type DosDonts } from '../../utils/packageOptions';

function LineList({ label, one, items, onChange }: { label: string; one: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.listTitle}>{label}</Text>
      {items.map((item, i) => (
        <View key={i} style={[ui.field, { gap: 8 }]}>
          <TextInput
            style={ui.input}
            value={item}
            maxLength={MAX_DO_LENGTH}
            placeholder={one}
            placeholderTextColor={DARK.muted}
            onChangeText={(t) => onChange(items.map((x, idx) => (idx === i ? t : x)))}
            accessibilityLabel={`${one} ${i + 1}`}
          />
          <Pressable onPress={() => onChange(items.filter((_, idx) => idx !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${one.toLowerCase()} ${i + 1}`}>
            <Ionicons name="close-circle" size={22} color={DARK.muted} />
          </Pressable>
        </View>
      ))}
      {items.length < MAX_DOS && (
        <Pressable onPress={() => onChange([...items, ''])} style={s.addRow} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
          <Text style={s.addRowText}>Add a {one.toLowerCase()}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Dos and don'ts for a package or rental item: special instructions for using the equipment. */
export function DosDontsEditor({ value, onChange }: { value: DosDonts; onChange: (v: DosDonts) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={ui.label}>Dos and don’ts</Text>
        <Text style={s.hint}>Special instructions for using your equipment, one short line each. Customers see them before they book and on their booking.</Text>
      </View>
      <LineList label="Dos" one="Do" items={value.dos} onChange={(dos) => onChange({ ...value, dos })} />
      <LineList label="Don’ts" one="Don’t" items={value.donts} onChange={(donts) => onChange({ ...value, donts })} />
    </View>
  );
}

/** The vendor's dos and don'ts as customers read them. Renders nothing when empty. */
export function DosDontsList({ dos, donts, title = 'Dos and don’ts' }: { dos?: string[] | null; donts?: string[] | null; title?: string }) {
  if (!dos?.length && !donts?.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.title}>{title}</Text>
      {(dos ?? []).map((d, i) => (
        <View key={`d${i}`} style={s.line} accessible accessibilityLabel={`Do: ${d}`}>
          <Ionicons name="checkmark-circle" size={18} color="#86efac" />
          <Text style={s.body}>{d}</Text>
        </View>
      ))}
      {(donts ?? []).map((d, i) => (
        <View key={`n${i}`} style={s.line} accessible accessibilityLabel={`Don’t: ${d}`}>
          <Ionicons name="close-circle" size={18} color="#fca5a5" />
          <Text style={s.body}>{d}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  listTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  addRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRowText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  body: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
});
