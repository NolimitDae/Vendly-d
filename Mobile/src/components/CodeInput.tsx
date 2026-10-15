import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DARK, FONTS } from '../constants/colors';

/**
 * Six code boxes driven by one invisible input laid over them, so tapping, paste and
 * one-time-code autofill all work.
 */
export default function CodeInput({ value, onChange, length = 6, autoFocus = true }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  return (
    <View style={s.boxes}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[s.box, i === value.length && s.boxActive]}>
          <Text style={s.digit}>{value[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        accessibilityLabel="Verification code"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={s.overlay}
      />
    </View>
  );
}

const s = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: { flex: 1, maxWidth: 50, aspectRatio: 1, borderRadius: 20, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderColor: DARK.border },
  digit: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  overlay: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
});
