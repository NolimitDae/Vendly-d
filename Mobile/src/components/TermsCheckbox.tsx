import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandGradient } from './brand';
import { DARK, FONTS } from '../constants/colors';

// Where the Terms and Privacy pages live; set EXPO_PUBLIC_WEB_URL in the EAS environment to change it.
const WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://vendlymarketplace.com').replace(/\/+$/, '');

export default function TermsCheckbox({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={s.row}>
        <Pressable
          onPress={() => onChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="I agree to the Terms of Service and acknowledge the Privacy Policy"
          hitSlop={8}
        >
          {checked ? (
            <BrandGradient style={s.box}>
              <Ionicons name="checkmark" size={15} color="#fff" />
            </BrandGradient>
          ) : (
            <View style={[s.box, s.boxOff, error && { borderColor: '#F87171' }]} />
          )}
        </Pressable>
        <Text style={s.text}>
          I have read and agree to the{' '}
          <Text style={s.link} onPress={() => Linking.openURL(`${WEB}/terms`)} accessibilityRole="link">Terms of Service</Text>
          {' '}and acknowledge the{' '}
          <Text style={s.link} onPress={() => Linking.openURL(`${WEB}/privacy`)} accessibilityRole="link">Privacy Policy</Text>.
        </Text>
      </View>
      {error && <Text style={s.error}>Please accept the Terms of Service and Privacy Policy to continue.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOff: { borderWidth: 1.5, borderColor: DARK.border, backgroundColor: DARK.field },
  text: { flex: 1, color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontFamily: FONTS.semibold },
  error: { color: '#F87171', fontSize: 13, fontFamily: FONTS.regular },
});
