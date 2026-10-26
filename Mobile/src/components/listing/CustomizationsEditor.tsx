import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import {
  MAX_GROUP_TITLE,
  MAX_OPTION_GROUPS,
  MAX_OPTION_LABEL,
  MAX_OPTIONS_PER_GROUP,
  move,
  newCustomization,
  newOption,
  type CustomizationDraft,
  type OptionDraft,
} from '../../utils/packageOptions';

/**
 * Package form section: "Add customization" makes a dropdown customers answer when booking (a braider's
 * "Style": Knotless, Miracle knots…), pick one or pick up to N, optional or required, each option with an
 * optional upcharge, counted once or per person / hour / day (`unit`, on packages priced that way).
 */
export default function CustomizationsEditor({
  value,
  onChange,
  unit,
}: {
  value: CustomizationDraft[];
  onChange: (v: CustomizationDraft[]) => void;
  /** person / hour / day when the package is priced that way, else null */
  unit: string | null;
}) {
  const setGroup = (i: number, patch: Partial<CustomizationDraft>) => onChange(value.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const setOption = (i: number, j: number, patch: Partial<OptionDraft>) =>
    setGroup(i, { options: value[i].options.map((o, idx) => (idx === j ? { ...o, ...patch } : o)) });

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={ui.label}>Customizations</Text>
        <Text style={s.hint}>Dropdowns customers answer when they book, for example “Style” with Knotless or Miracle knots. Add an upcharge to any option.</Text>
      </View>

      {value.map((g, i) => {
        const name = g.title.trim() || `Customization ${i + 1}`;
        return (
          <View key={g.key} style={s.group}>
            <View style={s.row}>
              <View style={[ui.field, { flex: 1 }]}>
                <TextInput
                  style={ui.input}
                  value={g.title}
                  maxLength={MAX_GROUP_TITLE}
                  placeholder="Title, e.g. Style"
                  placeholderTextColor={DARK.muted}
                  onChangeText={(t) => setGroup(i, { title: t })}
                  accessibilityLabel={`Title of customization ${i + 1}`}
                />
              </View>
              <IconButton icon="arrow-up" label={`Move ${name} up`} disabled={i === 0} onPress={() => onChange(move(value, i, -1))} />
              <IconButton icon="arrow-down" label={`Move ${name} down`} disabled={i === value.length - 1} onPress={() => onChange(move(value, i, 1))} />
              <IconButton icon="trash-outline" label={`Remove ${name}`} onPress={() => onChange(value.filter((_, idx) => idx !== i))} />
            </View>

            <View style={s.chips}>
              <Chip label="Pick one" active={!g.multi} onPress={() => setGroup(i, { multi: false })} />
              <Chip label="Pick up to…" active={g.multi} onPress={() => setGroup(i, { multi: true })} />
              {g.multi && (
                <View style={[ui.field, s.small]}>
                  <TextInput
                    style={ui.input}
                    value={g.max}
                    onChangeText={(t) => setGroup(i, { max: t.replace(/\D/g, '') })}
                    keyboardType="number-pad"
                    accessibilityLabel={`Most options customers can pick for ${name}`}
                  />
                </View>
              )}
            </View>
            <Pressable
              style={s.check}
              onPress={() => setGroup(i, { required: !g.required })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: g.required }}
              accessibilityLabel={`${name} is required`}
            >
              <Ionicons name={g.required ? 'checkbox' : 'square-outline'} size={22} color={g.required ? DARK.accent : DARK.muted} />
              <Text style={s.checkText}>Required</Text>
            </Pressable>

            {g.options.map((o, j) => (
              <View key={o.key} style={s.option}>
                <View style={s.row}>
                  <View style={[ui.field, { flex: 1 }]}>
                    <TextInput
                      style={ui.input}
                      value={o.label}
                      maxLength={MAX_OPTION_LABEL}
                      placeholder={j === 0 ? 'e.g. Knotless' : 'Option'}
                      placeholderTextColor={DARK.muted}
                      onChangeText={(t) => setOption(i, j, { label: t })}
                      accessibilityLabel={`Option ${j + 1} of ${name}`}
                    />
                  </View>
                  <View style={[ui.field, s.price]}>
                    <Text style={s.plus}>+$</Text>
                    <TextInput
                      style={ui.input}
                      value={o.price}
                      placeholder="0"
                      placeholderTextColor={DARK.muted}
                      onChangeText={(t) => setOption(i, j, { price: t.replace(/[^0-9.]/g, '') })}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Upcharge for option ${j + 1} of ${name}`}
                    />
                  </View>
                </View>
                <View style={s.row}>
                  {unit ? (
                    <View style={[s.chips, { flex: 1 }]}>
                      <Chip label="Once" active={o.price_mode === 'FLAT'} onPress={() => setOption(i, j, { price_mode: 'FLAT' })} />
                      <Chip label={`Per ${unit}`} active={o.price_mode === 'PER_UNIT'} onPress={() => setOption(i, j, { price_mode: 'PER_UNIT' })} />
                    </View>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <IconButton icon="arrow-up" label={`Move option ${j + 1} of ${name} up`} disabled={j === 0} onPress={() => setGroup(i, { options: move(g.options, j, -1) })} />
                  <IconButton icon="arrow-down" label={`Move option ${j + 1} of ${name} down`} disabled={j === g.options.length - 1} onPress={() => setGroup(i, { options: move(g.options, j, 1) })} />
                  <IconButton icon="close-circle" label={`Remove option ${j + 1} of ${name}`} onPress={() => setGroup(i, { options: g.options.filter((_, idx) => idx !== j) })} />
                </View>
              </View>
            ))}
            {g.options.length < MAX_OPTIONS_PER_GROUP && (
              <Pressable onPress={() => setGroup(i, { options: [...g.options, newOption()] })} style={s.addRow} accessibilityRole="button">
                <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
                <Text style={s.addRowText}>Add an option</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {value.length < MAX_OPTION_GROUPS && (
        <Pressable onPress={() => onChange([...value, newCustomization()])} style={s.addGroup} accessibilityRole="button">
          <Ionicons name="add" size={20} color={DARK.accent} />
          <Text style={s.addRowText}>Add customization</Text>
        </Pressable>
      )}
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={[s.iconBtn, disabled && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
      <Ionicons name={icon} size={20} color={DARK.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  hint: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  group: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: DARK.card },
  option: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: DARK.field },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  small: { width: 72 },
  price: { width: 104, gap: 4 },
  plus: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.medium },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  checkText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRowText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  addGroup: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: DARK.border },
});
