import React from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';
import { SlidingPill, useSlidingHighlight } from './SlidingTabs';
import { haptic } from '../utils/haptics';

/**
 * The bottom menu: a floating, rounded bar inset from the screen edges, with the brand highlight
 * sliding to the tab picked. It keeps its own strip at the bottom, so nothing on a page sits behind
 * it. A tab's `tabBarStyle: { display: 'none' }` hides it, as with the standard bar.
 */
export default function FloatingTabBar({ state, descriptors, navigation, insets, icons }: BottomTabBarProps & { icons: Record<string, keyof typeof Ionicons.glyphMap> }) {
  const [width, setWidth] = React.useState(0);
  const count = state.routes.length;
  const slot = width ? width / count : 0;
  const boxes = state.routes.map((_, i) => (slot ? { x: i * slot, width: slot } : undefined));
  const hl = useSlidingHighlight(boxes, state.index);

  const focused = descriptors[state.routes[state.index].key].options;
  if ((StyleSheet.flatten(focused.tabBarStyle as ViewStyle) as ViewStyle | undefined)?.display === 'none') return null;

  return (
    <View style={[s.band, { paddingBottom: Math.max(insets.bottom - 8, 10), paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
      <View style={s.bar}>
        <View style={s.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
          <SlidingPill hl={hl} inset={0} radius={28} />
          {state.routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
            const on = state.index === i;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on) haptic.select();
              if (!on && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            const content = (lit: boolean) => (
              <>
                <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={22} color={lit ? '#fff' : DARK.muted} />
                <Text style={[s.label, { color: lit ? '#fff' : DARK.muted }]} numberOfLines={1}>{label}</Text>
              </>
            );
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                style={s.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                testID={options.tabBarTestID}
              >
                {/* the white icon and label fade in as the highlight arrives */}
                <Animated.View style={[s.center, { opacity: hl.dimness(i) }]}>{content(false)}</Animated.View>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center, { opacity: hl.litness(i) }]}>{content(true)}</Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  band: { paddingTop: 8, backgroundColor: DARK.bg },
  bar: {
    padding: 6,
    borderRadius: 34,
    backgroundColor: DARK.card,
    borderWidth: 1,
    borderColor: 'rgba(217,166,221,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  row: { flexDirection: 'row' },
  tab: { flex: 1, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11.5, fontFamily: FONTS.semibold },
});
