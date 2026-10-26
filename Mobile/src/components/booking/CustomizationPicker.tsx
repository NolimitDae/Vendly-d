import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { haptic } from '../../utils/haptics';
import { togglePick, type Customization, type Picks } from '../../utils/packageOptions';

/**
 * The package's customizations on the booking screen: each one a list to pick from, one option
 * (radio) or up to N (checkboxes), with its upcharge ("+$20.00", "+$5.00 / person").
 */
export default function CustomizationPicker({ groups, value, onChange }: { groups: Customization[]; value: Picks; onChange: (v: Picks) => void }) {
  if (!groups.length) return null;
  return (
    <View style={{ gap: 16 }}>
      {groups.map((g) => {
        const picked = value[g.id] ?? [];
        const multi = g.max_select > 1;
        return (
          <View key={g.id} style={{ gap: 8 }} accessibilityRole={multi ? undefined : 'radiogroup'} accessibilityLabel={g.title}>
            <Text style={ui.label}>
              {g.title}
              <Text style={s.hint}>{`  ${multi ? `Pick up to ${g.max_select}` : 'Pick one'} · ${g.required ? 'Required' : 'Optional'}`}</Text>
            </Text>
            {g.options.map((o) => {
              const on = picked.includes(o.id);
              const full = multi && !on && picked.length >= g.max_select;
              return (
                <Pressable
                  key={o.id}
                  disabled={full}
                  onPress={() => {
                    haptic.select();
                    onChange(togglePick(value, g, o.id));
                  }}
                  style={[s.option, on && s.optionOn, full && { opacity: 0.4 }]}
                  accessibilityRole={multi ? 'checkbox' : 'radio'}
                  accessibilityState={multi ? { checked: on, disabled: full } : { selected: on }}
                  accessibilityLabel={o.price_text ? `${o.label}, ${o.price_text}` : o.label}
                >
                  <Ionicons
                    name={multi ? (on ? 'checkbox' : 'square-outline') : on ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={on ? DARK.accent : DARK.muted}
                  />
                  <Text style={s.label}>{o.label}</Text>
                  {!!o.price_text && <Text style={s.price}>{o.price_text}</Text>}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: 'transparent' },
  optionOn: { borderColor: DARK.border },
  label: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  price: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
});
