import React from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND_GRADIENT, BRAND_GRADIENT_STOPS, DARK, FONTS } from '../constants/colors';
import { useReduceMotion } from './brand';
import { haptic } from '../utils/haptics';

/**
 * How the highlight moves between choices, everywhere in the app (tab bars, segmented tabs, filter
 * rows): an unhurried spring that arrives in a little over half a second and settles without bouncing.
 */
export const SLIDE_SPRING = { stiffness: 90, damping: 18, mass: 1 } as const;

type Box = { x: number; width: number };

/**
 * The moving highlight behind a row of choices. `boxes` are the choices' measured positions and
 * `index` the one picked. Its position and width both glide on the native thread, so a busy app
 * (a new page drawing) can't stall or jump it. Call `moveTo` from the tap itself, so the glide starts
 * before the page changes. With Reduce Motion it moves straight there.
 */
export function useSlidingHighlight(boxes: (Box | undefined)[], index: number) {
  const reduceMotion = useReduceMotion();
  // made once and never replaced: swapping animated values mid-glide makes the highlight blink
  const [pill] = React.useState(() => ({
    x: new Animated.Value(0),
    width: new Animated.Value(0),
    squeeze: new Animated.Value(1),
    shown: new Animated.Value(0),
  }));
  const boxesRef = React.useRef(boxes);
  boxesRef.current = boxes;
  const aim = React.useRef<Box | null>(null);

  const moveTo = React.useCallback(
    (i: number) => {
      const target = boxesRef.current[i];
      if (!target) return;
      // already there, or already gliding there: a fresh start would cost the glide its momentum
      if (aim.current && aim.current.x === target.x && aim.current.width === target.width) return;
      const first = !aim.current;
      aim.current = target;
      if (first || reduceMotion) {
        // first placement (or Reduce Motion): straight there, no slide in from the left edge
        pill.x.setValue(target.x);
        pill.width.setValue(target.width);
        if (first) Animated.timing(pill.shown, { toValue: 1, duration: 120, useNativeDriver: true }).start();
        return;
      }
      Animated.parallel([
        Animated.spring(pill.x, { toValue: target.x, ...SLIDE_SPRING, useNativeDriver: true }),
        Animated.spring(pill.width, { toValue: target.width, ...SLIDE_SPRING, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pill.squeeze, { toValue: 0.94, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.spring(pill.squeeze, { toValue: 1, ...SLIDE_SPRING, useNativeDriver: true }),
        ]),
      ]).start();
    },
    [reduceMotion, pill],
  );

  // the picked choice changed some other way (the back button, a link to another tab), or was measured
  const target = boxes[index];
  React.useEffect(() => {
    moveTo(index);
  }, [moveTo, index, target?.x, target?.width]);

  // How lit each choice is (0 to 1) as the highlight passes over it, for its white label, and the
  // other way round for its grey one. Kept between renders for the same reason as the values above.
  const complete = boxes.length > 0 && boxes.every(Boolean);
  const layoutKey = complete ? boxes.map((b) => `${b!.x}:${b!.width}`).join('|') : `pending:${boxes.length}:${index}`;
  const labels = React.useMemo(() => {
    const lit = boxes.map((me, i) => {
      if (!complete || !me) return i === index ? 1 : 0;
      const prev = boxes[i - 1]?.x ?? me.x - Math.max(me.width, 1);
      const next = boxes[i + 1]?.x ?? me.x + Math.max(me.width, 1);
      if (!(prev < me.x && me.x < next)) return i === index ? 1 : 0;
      return pill.x.interpolate({ inputRange: [prev, me.x, next], outputRange: [0, 1, 0], extrapolate: 'clamp' });
    });
    const dim = lit.map((l) => (typeof l === 'number' ? 1 - l : Animated.subtract(1, l)));
    return { lit, dim };
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const litness = (i: number) => labels.lit[i] ?? (i === index ? 1 : 0);
  const dimness = (i: number) => labels.dim[i] ?? (i === index ? 0 : 1);
  return { pill, moveTo, litness, dimness };
}

/**
 * The highlight itself: the brand gradient pill, positioned by useSlidingHighlight. It is drawn as two
 * round ends and a stretched middle so its width can glide on the native thread too (a view's real
 * width can't). `height` is the row's height.
 */
export const SlidingPill = React.memo(function SlidingPill({ pill, height }: { pill: ReturnType<typeof useSlidingHighlight>['pill']; height: number }) {
  const parts = React.useMemo(
    () => ({
      // the stretched middle runs from the left end's centre to the right end's centre, covering their inner halves
      middleX: Animated.add(pill.x, height / 2),
      middleScale: pill.width.interpolate({ inputRange: [height, height + MIDDLE], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
      rightX: Animated.add(pill.x, Animated.add(pill.width, -height)),
    }),
    [pill, height],
  );
  const end = { width: height, height, borderRadius: height / 2 };
  return (
    <Animated.View pointerEvents="none" style={[s.pillTrack, { height, opacity: pill.shown, transform: [{ scaleY: pill.squeeze }] }]}>
      <Animated.View style={[s.pillPart, end, { backgroundColor: BRAND_GRADIENT[0], transform: [{ translateX: pill.x }] }]} />
      <Animated.View style={[s.pillPart, end, { backgroundColor: BRAND_GRADIENT[BRAND_GRADIENT.length - 1], transform: [{ translateX: parts.rightX }] }]} />
      <Animated.View style={[s.pillPart, { width: MIDDLE, height, transformOrigin: 'left', transform: [{ translateX: parts.middleX }, { scaleX: parts.middleScale }] }]}>
        <LinearGradient
          colors={BRAND_GRADIENT as unknown as [string, string, string]}
          locations={BRAND_GRADIENT_STOPS as unknown as [number, number, number]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
});

/** The pill middle's drawn width, stretched to fit. */
const MIDDLE = 100;

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
  const valueIndex = Math.max(0, items.findIndex((t) => t.key === value));
  // the choice just tapped, ahead of `value` by a frame (see onPress); follows `value` otherwise
  const [heading, setHeading] = React.useState(valueIndex);
  React.useEffect(() => setHeading(valueIndex), [valueIndex]);
  const index = Math.min(heading, items.length - 1);
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
          // the glide starts now, and the page updates a frame later, once it's under way: a busy
          // page redraw then can't hold it back
          hl.moveTo(i);
          setHeading(i);
          requestAnimationFrame(() => onChange(t.key));
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
          <SlidingPill pill={hl.pill} height={CHOICE_HEIGHT} />
          {choices}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={[s.bar, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <View style={s.row}>
        <SlidingPill pill={hl.pill} height={CHOICE_HEIGHT} />
        {choices}
      </View>
    </View>
  );
}

const CHOICE_HEIGHT = 44;

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
  pillTrack: { position: 'absolute', top: 0, left: 0, right: 0 },
  pillPart: { position: 'absolute', top: 0, left: 0 },
  choice: { height: CHOICE_HEIGHT, paddingHorizontal: 16, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  choiceEven: { flex: 1, paddingHorizontal: 6 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontFamily: FONTS.semibold },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  badgeLit: { backgroundColor: 'rgba(255,255,255,0.22)' },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FONTS.semibold },
});
