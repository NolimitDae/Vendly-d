import React, { useId, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
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
import { haptic } from '../utils/haptics';

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

const LOGO_PATH = 'M30 28 108 191 186 28 258 125 330 28V191';
// Length of LOGO_PATH (about 766): the V's two strokes, the M's two shorter ones, then the upright.
const LOGO_LENGTH = [[30, 28], [108, 191], [186, 28], [258, 125], [330, 28], [330, 191]].reduce(
  (sum, [x, y], i, p) => (i ? sum + Math.hypot(x - p[i - 1][0], y - p[i - 1][1]) : 0),
  0,
);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The loading screen's logo. It opens as the full mark (the same picture as the native splash),
 * dims to a faint outline, and a bright stroke draws over it starting from the V; then it breathes
 * gently until loading ends. With Reduce Motion on it is just the still logo. onDrawn fires once the
 * drawing is complete (straight away with Reduce Motion).
 */
export function AnimatedLogoMark({ size = 40, onDrawn }: { size?: number; onDrawn?: () => void }) {
  const id = useId().replace(/:/g, '');
  const reduceMotion = useReduceMotion();
  // kept in a ref so a new callback each render doesn't restart the drawing
  const drawn = React.useRef(onDrawn);
  drawn.current = onDrawn;
  const track = React.useRef(new Animated.Value(1)).current;
  // starts a little past the full length: a dash ending exactly at the path's start can leave a round-cap dot
  const offset = React.useRef(new Animated.Value(LOGO_LENGTH + 30)).current;
  const glow = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      track.setValue(1);
      offset.setValue(0);
      glow.setValue(1);
      drawn.current?.();
      return;
    }
    const draw = Animated.parallel([
      Animated.timing(track, { toValue: 0.16, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      // SVG props can't use the native driver; the JS thread is mostly idle while the app loads
      Animated.timing(offset, { toValue: 0, duration: 1150, delay: 120, easing: Easing.bezier(0.65, 0, 0.35, 1), useNativeDriver: false }),
    ]);
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.7, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    draw.start(({ finished }) => {
      if (!finished) return;
      drawn.current?.();
      breathe.start();
    });
    return () => {
      draw.stop();
      breathe.stop();
    };
  }, [reduceMotion, track, offset, glow]);

  const width = (size * 360) / 220;
  const layer = (gradientId: string, path: React.ReactNode) => (
    <Svg width={width} height={size} viewBox="0 0 360 220">
      <Defs>
        <SvgGradient id={gradientId} x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#9A45A3" />
          <Stop offset="0.52" stopColor="#B864C0" />
          <Stop offset="1" stopColor="#DDA7E2" />
        </SvgGradient>
      </Defs>
      {path}
    </Svg>
  );
  const stroke = { d: LOGO_PATH, fill: 'none', strokeWidth: 57, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Animated.View accessible accessibilityLabel="Vendly" style={{ width, height: size, opacity: glow }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: track }]}>
        {layer(`${id}t`, <Path {...stroke} stroke={`url(#${id}t)`} />)}
      </Animated.View>
      <View style={StyleSheet.absoluteFill}>
        {layer(
          `${id}d`,
          <AnimatedPath {...stroke} stroke={`url(#${id}d)`} strokeDasharray={[LOGO_LENGTH, LOGO_LENGTH * 2]} strokeDashoffset={offset} />,
        )}
      </View>
    </Animated.View>
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

/**
 * A pressable that sinks slightly while held, like iOS controls and cards: 0.97 in 120 ms ease-out on
 * press-in, back on release. It only animates transform on the native driver, and stays still when
 * the iPhone's Reduce Motion setting is on.
 */
export function PressableScale({
  children,
  style,
  onPress,
  disabled,
  scaleTo = 0.97,
  ...rest
}: Omit<React.ComponentProps<typeof Pressable>, 'style' | 'children'> & { children: React.ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const to = (v: number) =>
    !reduceMotion && Animated.timing(scale, { toValue: v, duration: 120, easing: PRESS_EASE, useNativeDriver: true }).start();
  return (
    // the pressable itself scales, so layout styles (widths, margins) keep working as on a plain Pressable
    <AnimatedPressable
      {...rest}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      // a finger drifting a little while pressing shouldn't cancel the tap
      pressRetentionOffset={{ top: 20, bottom: 20, left: 20, right: 20 }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Strong ease-out: responds the instant the finger lands. */
const PRESS_EASE = Easing.bezier(0.23, 1, 0.32, 1);

/** The iPhone's Reduce Motion setting, kept current while the app runs. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      <BrandGradient style={[ui.button, pill && { borderRadius: 100, height: 54 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={ui.buttonText}>{title}</Text>}
      </BrandGradient>
    </PressableScale>
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

/** Figma's screen header: 48px round back button, centred 18/600 title, optional right-hand slot. */
export function ScreenHeader({
  title,
  onBack,
  right,
  light,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  /** White back button for use over photos. */
  light?: boolean;
}) {
  return (
    <View style={ui.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={[ui.back, light && { backgroundColor: '#fff' }]}
      >
        <Ionicons name="arrow-back" size={22} color={light ? DARK.bg : '#fff'} />
      </Pressable>
      <Text style={ui.headerTitle} numberOfLines={1}>{title}</Text>
      {/* at least the back button's width, so the title stays centred; wider for two buttons */}
      <View style={{ minWidth: 48, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Selectable pill: category chips, sub-category tabs and filter options. */
export function Chip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const inner = (
    <>
      {icon}
      <Text style={[ui.chipText, active && { color: '#fff' }]}>{label}</Text>
    </>
  );
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {active ? <BrandGradient style={ui.chip}>{inner}</BrandGradient> : <View style={[ui.chip, { backgroundColor: DARK.card }]}>{inner}</View>}
    </Pressable>
  );
}

/** Floating "Do you have any question?" bubble that opens a chat with the vendor. */
export function ChatBubble({ onPress, label = 'Message the vendor' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={ui.bubble}>
      <BrandGradient style={ui.bubbleIcon}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
      </BrandGradient>
      <Text style={ui.bubbleText}>Do you have any{'\n'}question?</Text>
    </Pressable>
  );
}

/** Dark card used for grouped details, summaries and notes. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export const ui = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 8 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 43, paddingHorizontal: 20, borderRadius: 100 },
  chipText: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  bubble: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    paddingRight: 14,
    borderRadius: 100,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  bubbleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { color: '#fff', fontSize: 12, lineHeight: 17, fontFamily: FONTS.semibold },
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 8 },
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
