import React from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, BRAND_GRADIENT_STOPS, DARK, FONTS } from '../constants/colors';
import { useReduceMotion } from './brand';
import { haptic } from '../utils/haptics';

/**
 * How the highlight moves between choices, everywhere in the app (tab bars, segmented tabs, filter
 * rows): a spring that arrives in about a third of a second with a slight, natural settle.
 */
export const SLIDE_SPRING = { stiffness: 320, damping: 30, mass: 1 } as const;

type Box = { x: number; width: number };

/**
 * The moving highlight behind a row of choices. `boxes` are the choices' measured positions; the
 * highlight glides to `index` (position on the native thread, width alongside it), with a short
 * squeeze as it leaves. With Reduce Motion it moves straight there.
 */
export function useSlidingHighlight(boxes: (Box | undefined)[], index: number) {
  const reduceMotion = useReduceMotion();
  const x = React.useRef(new Animated.Value(0)).current;
  const width = React.useRef(new Animated.Value(0)).current;
  const squeeze = React.useRef(new Animated.Value(1)).current;
  const shown = React.useRef(new Animated.Value(0)).current;
  const placed = React.useRef(false);
  const target = boxes[index];

  React.useEffect(() => {
    if (!target) return;
    if (!placed.current || reduceMotion) {
      // first placement (or Reduce Motion): straight there, no slide in from the left edge
      x.setValue(target.x);
      width.setValue(target.width);
      if (!placed.current) {
        placed.current = true;
        Animated.timing(shown, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      }
      return;
    }
    const anim = Animated.parallel([
      Animated.spring(x, { toValue: target.x, ...SLIDE_SPRING, useNativeDriver: true }),
      Animated.spring(width, { toValue: target.width, ...SLIDE_SPRING, useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(squeeze, { toValue: 0.94, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(squeeze, { toValue: 1, ...SLIDE_SPRING, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.x, target?.width, reduceMotion]);

  /** How lit choice `i` is (0 to 1) as the highlight passes over it, for its white label. */
  const litness = (i: number) => {
    const me = boxes[i];
    if (!me || boxes.some((b) => !b)) return i === index ? 1 : 0;
    const prev = boxes[i - 1]?.x ?? me.x - Math.max(me.width, 1);
    const next = boxes[i + 1]?.x ?? me.x + Math.max(me.width, 1);
    if (!(prev < me.x && me.x < next)) return i === index ? 1 : 0;
    return x.interpolate({ inputRange: [prev, me.x, next], outputRange: [0, 1, 0], extrapolate: 'clamp' });
  };

  /** The other way round, for its grey label. */
  const dimness = (i: number) => {
    const lit = litness(i);
    return typeof lit === 'number' ? 1 - lit : Animated.subtract(1, lit);
  };

  return { x, width, squeeze, shown, litness, dimness };
}

/** The highlight itself: the brand gradient pill, positioned by useSlidingHighlight. */
export function SlidingPill({ hl, inset, radius }: { hl: ReturnType<typeof useSlidingHighlight>; inset: number; radius: number }) {
  return (
    <Animated.View pointerEvents="none" style={[s.pillTrack, { top: inset, bottom: inset, opacity: hl.shown, transform: [{ translateX: hl.x }, { scaleY: hl.squeeze }] }]}>
      <Animated.View style={[s.pillShadow, { width: hl.width, borderRadius: radius }]}>
        <LinearGradient
          colors={BRAND_GRADIENT as unknown as [string, string, string]}
          locations={BRAND_GRADIENT_STOPS as unknown as [number, number, number]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      </Animated.View>
    </Animated.View>
  );
}

export type SlidingTab<K extends string> = { key: K; label: string; badge?: number | string | null; accessibilityLabel?: string };

/**
 * A row of choices with a highlight that slides to the one picked: the app's segmented tabs and
 * filter rows. `scroll` for rows that can be wider than the screen (choices keep their natural width
 * and the row scrolls to keep the picked one in view); otherwise the choices share the width evenly.
 */
export default function SlidingTabs<K extends string>({
  items,
  value,
  onChange,
  scroll = false,
  style,
  accessibilityLabel,
}: {
  items: SlidingTab<K>[];
  value: K;
  onChange: (key: K) => void;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const [boxes, setBoxes] = React.useState<(Box | undefined)[]>(() => items.map(() => undefined));
  const index = Math.max(0, items.findIndex((t) => t.key === value));
  const hl = useSlidingHighlight(boxes, index);
  const scroller = React.useRef<ScrollView>(null);
  const viewWidth = React.useRef(0);
  const reduceMotion = useReduceMotion();

  // a changed list (a tab added or removed) is measured again; the first list keeps what it measured
  const keys = items.map((t) => t.key).join('|');
  const lastKeys = React.useRef(keys);
  React.useEffect(() => {
    if (lastKeys.current === keys) return;
    lastKeys.current = keys;
    setBoxes(items.map(() => undefined));
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setBoxes((prev) => {
      if (prev[i] && prev[i]!.x === x && prev[i]!.width === width) return prev;
      const next = prev.slice();
      next[i] = { x, width };
      return next;
    });
  };

  // keep the picked choice in view in a scrolling row
  const picked = boxes[index];
  React.useEffect(() => {
    if (!scroll || !picked || !viewWidth.current) return;
    scroller.current?.scrollTo({ x: Math.max(0, picked.x - (viewWidth.current - picked.width) / 2), animated: !reduceMotion });
  }, [scroll, picked?.x, picked?.width, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = items.map((t, i) => {
    const on = i === index;
    const label = (lit: boolean) => (
      <View style={s.labelRow}>
        {/* evenly shared rows can be tight: a long label shrinks a little rather than being cut off */}
        <Text style={[s.label, { color: lit ? '#fff' : DARK.muted }]} numberOfLines={1} adjustsFontSizeToFit={!scroll} minimumFontScale={0.75}>{t.label}</Text>
        {t.badge != null && t.badge !== 0 && t.badge !== '' && (
          <View style={[s.badge, lit && s.badgeLit]}>
            <Text style={s.badgeText}>{t.badge}</Text>
          </View>
        )}
      </View>
    );
    return (
      <Pressable
        key={t.key}
        onLayout={measure(i)}
        onPress={() => {
          if (on) return;
          haptic.select();
          onChange(t.key);
        }}
        style={[s.choice, !scroll && s.choiceEven]}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t.accessibilityLabel ?? (t.badge ? `${t.label}, ${t.badge}` : t.label)}
      >
        {/* the white label fades in as the highlight arrives, and out as it leaves */}
        <Animated.View style={{ opacity: hl.dimness(i) }}>{label(false)}</Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center, { opacity: hl.litness(i) }]}>
          {label(true)}
        </Animated.View>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <View style={[s.bar, s.barScroll, style]} onLayout={(e) => (viewWidth.current = e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollRow}
          accessibilityRole="tablist"
          accessibilityLabel={accessibilityLabel}
        >
          <SlidingPill hl={hl} inset={0} radius={100} />
          {choices}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={[s.bar, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <View style={s.row}>
        <SlidingPill hl={hl} inset={0} radius={100} />
        {choices}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    padding: 4,
    borderRadius: 100,
    backgroundColor: DARK.card,
    borderWidth: 1,
    borderColor: 'rgba(217,166,221,0.12)',
  },
  barScroll: { paddingHorizontal: 0 },
  row: { flexDirection: 'row' },
  scrollRow: { flexDirection: 'row', paddingHorizontal: 4 },
  pillTrack: { position: 'absolute', left: 0 },
  pillShadow: {
    flex: 1,
    shadowColor: '#A84AB0',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  choice: { height: 44, paddingHorizontal: 16, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  choiceEven: { flex: 1, paddingHorizontal: 6 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontFamily: FONTS.semibold },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  badgeLit: { backgroundColor: 'rgba(255,255,255,0.22)' },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FONTS.semibold },
});
