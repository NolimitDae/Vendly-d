import React, { useId, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_GRADIENT, BRAND_GRADIENT_STOPS, DARK, FONTS } from '../constants/colors';

// Same VM monogram as the website (Front-End/components/brand/Logo.tsx), brighter stops for dark backgrounds.
export function LogoMark({ size = 40, tone = 'dark' }: { size?: number; tone?: 'light' | 'dark' }) {
  const id = useId().replace(/:/g, '');
  const stops = tone === 'dark' ? ['#9A45A3', '#B864C0', '#DDA7E2'] : BRAND_GRADIENT;
  return (
    <Svg width={(size * 360) / 220} height={size} viewBox="0 0 360 220" accessibilityLabel="Vendly">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="0.52" stopColor={stops[1]} />
          <Stop offset="1" stopColor={stops[2]} />
        </SvgGradient>
      </Defs>
      <Path
        d="M30 28 108 191 186 28 258 125 330 28V191"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={57}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BrandGradient({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return (
    <LinearGradient
      colors={BRAND_GRADIENT as unknown as [string, string, string]}
      locations={BRAND_GRADIENT_STOPS as unknown as [number, number, number]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  pill,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Onboarding uses a fully rounded pill; forms use 24px corners. */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [{ opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }, style]}
    >
      <BrandGradient style={[ui.button, pill && { borderRadius: 100, height: 54 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={ui.buttonText}>{title}</Text>}
      </BrandGradient>
    </Pressable>
  );
}

export function OutlineButton({ title, icon, onPress }: { title: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [ui.outline, pressed && { opacity: 0.7 }]}>
      {icon}
      <Text style={ui.outlineText}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, secure, style, ...input }: TextInputProps & { label: string; secure?: boolean }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.label}>{label}</Text>
      <View style={ui.field}>
        <TextInput
          placeholderTextColor={DARK.muted}
          secureTextEntry={secure && hidden}
          style={[ui.input, style]}
          {...input}
        />
        {secure && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={DARK.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={ui.back}>
      <Ionicons name="arrow-back" size={22} color="#fff" />
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  button: { height: 56, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  buttonText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  outline: {
    height: 56,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: DARK.field,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  outlineText: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.medium },
  label: { color: DARK.text, fontSize: 16, fontFamily: FONTS.medium },
  field: {
    height: 56,
    borderRadius: 24,
    backgroundColor: DARK.field,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, color: DARK.text, fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 0 },
  back: { width: 48, height: 48, borderRadius: 24, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  h1: { color: DARK.text, fontSize: 24, lineHeight: 31, fontFamily: FONTS.semibold, textAlign: 'center' },
  body: { color: DARK.text, fontSize: 16, lineHeight: 26, fontFamily: FONTS.regular, textAlign: 'center' },
  muted: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.semibold },
});
