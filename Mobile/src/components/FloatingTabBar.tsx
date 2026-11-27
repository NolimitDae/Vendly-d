import React from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../constants/colors';
import { SlidingPill, useSlidingHighlight } from './SlidingTabs';
import { haptic } from '../utils/haptics';

/** How far the bar sits above the bottom of the screen. */
const bottomGap = (insetBottom: number) => Math.max(insetBottom - 10, 10);

/**
 * Room to leave at the end of a page's scrolling content so its last item can scroll clear of the
 * floating bar (the bar sits over the page, with the page showing around it).
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_HEIGHT + BAR_PADDING * 2 + bottomGap(insets.bottom) + 20;
}

/**
 * The bottom menu: a rounded bar floating over the page (no strip behind it), inset from the screen
 * edges, with the brand highlight sliding to the tab picked. Pages with the bar leave room for it with
 * useTabBarSpace(). A tab's `tabBarStyle: { display: 'none' }` hides it, as with the standard bar.
 */
export default function FloatingTabBar({ state, descriptors, navigation, insets, icons }: BottomTabBarProps & { icons: Record<string, keyof typeof Ionicons.glyphMap> }) {
  const [width, setWidth] = React.useState(0);
  const count = state.routes.length;
  const slot = width ? width / count : 0;
  const boxes = state.routes.map((_, i) => (slot ? { x: i * slot, width: slot } : undefined));
  // the tab just tapped, ahead of the navigation by a frame (see onPress); follows it otherwise
  const [heading, setHeading] = React.useState(state.index);
  React.useEffect(() => setHeading(state.index), [state.index]);
  const hl = useSlidingHighlight(boxes, heading);

  const focused = descriptors[state.routes[state.index].key].options;
  if ((StyleSheet.flatten(focused.tabBarStyle as ViewStyle) as ViewStyle | undefined)?.display === 'none') return null;

  return (
    <View pointerEvents="box-none" style={[s.band, { bottom: bottomGap(insets.bottom), left: 16 + insets.left, right: 16 + insets.right }]}>
      <View style={s.bar}>
        <View style={s.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
          <SlidingPill pill={hl.pill} height={TAB_HEIGHT} span={slot} />
          {state.routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
            const on = state.index === i;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (on || event.defaultPrevented) return;
              haptic.select();
              // the glide starts now, and the page changes a frame later, once it's under way: drawing
              // the new page then can't hold it back or make it jump
              hl.moveTo(i);
              setHeading(i);
              requestAnimationFrame(() => navigation.navigate(route.name, route.params));
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            const content = (lit: boolean) => (
              <>
                <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={20} color={lit ? '#fff' : DARK.muted} />
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

const TAB_HEIGHT = 46;
const BAR_PADDING = 4;

const s = StyleSheet.create({
  // floats over the page: nothing behind the bar itself
  band: { position: 'absolute' },
  bar: {
    padding: BAR_PADDING,
    borderRadius: 30,
    backgroundColor: 'rgba(36,16,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(217,166,221,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  row: { flexDirection: 'row' },
  tab: { flex: 1, height: TAB_HEIGHT, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontFamily: FONTS.semibold },
});
