import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { BrandGradient, PressableScale, useReduceMotion } from './brand';

type Layout = { x: number; y: number; w: number; h: number };

/**
 * A screen's segmented tabs (bookings filters, add-on kinds, event sections) with the same sliding
 * lens as the bottom tab bar: the highlight springs to the chosen tab, stretching slightly on the way.
 * Each screen keeps its own look through the style props. Reduce Motion moves it instantly.
 */
export default function SegmentedTabs<K extends string>({
  items,
  value,
  onChange,
  fill,
  scroll,
  style,
  itemStyle,
  textStyle,
  activeTextStyle,
  textProps,
  indicatorColor,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** equal-width tabs across the row */
  fill?: boolean;
  /** a horizontally scrolling row; `style` then styles its content */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  textProps?: Omit<TextProps, 'style' | 'children'>;
  /** a solid highlight instead of the brand gradient */
  indicatorColor?: string;
}) {
  const reduceMotion = useReduceMotion();
  const [layouts, setLayouts] = useState<(Layout | undefined)[]>([]);
  const active = items.findIndex((i) => i.key === value);
  const target = layouts[active];

  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const last = useRef<number | null>(null);
  // the moving highlight shows once its values are set, so its first frame isn't zero-width
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!target) return;
    const from = last.current;
    last.current = active;
    // first placement, a label resizing (counts loading in), or Reduce Motion: no movement
    if (from === null || from === active || reduceMotion) {
      x.setValue(target.x);
      width.setValue(target.w);
      stretch.setValue(1);
      setPlaced(true);
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: target.x, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: true }),
      // width is a layout prop, so it can't use the native driver; it's a single small view
      Animated.spring(width, { toValue: target.w, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.12, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 1, damping: 11, stiffness: 240, useNativeDriver: true }),
      ]),
    ]).start();
  }, [active, target?.x, target?.w, reduceMotion, x, width, stretch]);

  const radius = (StyleSheet.flatten(itemStyle)?.borderRadius as number | undefined) ?? 100;
  const highlight = (s: StyleProp<ViewStyle>, children?: React.ReactNode) =>
    indicatorColor ? <View style={[s, { backgroundColor: indicatorColor }]}>{children}</View> : <BrandGradient style={s}>{children}</BrandGradient>;

  const row = (
    <>
      {placed && target && (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: target.y, height: target.h, transform: [{ translateX: x }, { scaleX: stretch }] }}
        >
          <Animated.View style={{ width, height: target.h, borderRadius: radius, overflow: 'hidden' }}>
            {highlight(StyleSheet.absoluteFill)}
          </Animated.View>
        </Animated.View>
      )}
      {items.map((item, i) => {
        const on = i === active;
        const label = (
          <Text style={[textStyle, on && activeTextStyle]} {...textProps}>
            {item.label}
          </Text>
        );
        return (
          <PressableScale
            key={item.key}
            onPress={() => onChange(item.key)}
            scaleTo={0.95}
            style={fill ? { flex: 1 } : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e) => {
              const { x: lx, y, width: w, height: h } = e.nativeEvent.layout;
              setLayouts((prev) => {
                const p = prev[i];
                if (p && p.x === lx && p.y === y && p.w === w && p.h === h) return prev;
                const next = [...prev];
                next[i] = { x: lx, y, w, h };
                return next;
              });
            }}
          >
            {/* until the row is measured, the chosen tab draws its own highlight */}
            {on && !(placed && target) ? highlight(itemStyle, label) : <View style={itemStyle}>{label}</View>}
          </PressableScale>
        );
      })}
    </>
  );

  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={style} accessibilityRole="tablist">
      {row}
    </ScrollView>
  ) : (
    <View style={[{ flexDirection: 'row' }, style]} accessibilityRole="tablist">
      {row}
    </View>
  );
}
