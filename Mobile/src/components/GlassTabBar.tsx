import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandGradient, PressableScale, useReduceMotion } from './brand';
import { DARK, FONTS } from '../constants/colors';

const HEIGHT = 64;
// gap between the pill's edge and the sliding lens
const INSET = 5;
const SIDE = 16;
// on an iPad the pill stays phone-sized in the middle instead of stretching edge to edge
const MAX_WIDTH = 520;

/**
 * The app's bottom tab bar: a floating glass-style pill with a lit top edge, and a brand-gradient
 * "lens" that slides to the chosen tab with a spring and a slight stretch. It only animates
 * transform and opacity on the native driver, and changes instantly when Reduce Motion is on.
 * Tabs, order, presses and accessibility work like the stock React Navigation bar.
 */
export default function GlassTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reduceMotion = useReduceMotion();
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // a close guess for the first frame, corrected once the pill is laid out
  const width = measured || Math.min(screen.width - SIDE * 2 - insets.left - insets.right, MAX_WIDTH);
  const tabWidth = (width - INSET * 2) / state.routes.length;

  const x = useRef(new Animated.Value(state.index * tabWidth)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const lastIndex = useRef(state.index);

  useEffect(() => {
    const from = lastIndex.current;
    lastIndex.current = state.index;
    const to = state.index * tabWidth;
    if (reduceMotion || from === state.index) {
      x.setValue(to);
      stretch.setValue(1);
      return;
    }
    // the further it travels, the more it stretches, like a drop of liquid
    const pull = 1 + Math.min(0.1 * Math.abs(state.index - from), 0.25);
    Animated.parallel([
      Animated.spring(x, { toValue: to, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: pull, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 1, damping: 11, stiffness: 240, useNativeDriver: true }),
      ]),
    ]).start();
  }, [state.index, tabWidth, reduceMotion, x, stretch]);

  // Screens past each tab's first one hide the bar with tabBarStyle { display: 'none' }.
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  if (StyleSheet.flatten(focusedOptions.tabBarStyle as StyleProp<ViewStyle>)?.display === 'none') return null;

  return (
    <View style={[s.wrap, { paddingBottom: Math.max(insets.bottom - 8, 12), paddingLeft: SIDE + insets.left, paddingRight: SIDE + insets.right }]}>
      {/* content fades into the bar instead of stopping at a hard edge */}
      <LinearGradient pointerEvents="none" colors={['rgba(20,6,26,0)', DARK.bg]} style={s.fade} />
      <View style={s.shadow}>
        <View style={s.pill} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)} accessibilityRole="tablist">
          {/* glass sheen, lit from above */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* specular highlight along the top edge */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.rim}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              s.lens,
              {
                width: tabWidth,
                transform: [
                  { translateX: x },
                  { scaleX: stretch },
                  // squashes a touch as it stretches, so it reads as liquid rather than a sliding box
                  { scaleY: stretch.interpolate({ inputRange: [1, 1.25], outputRange: [1, 0.9] }) },
                ],
              },
            ]}
          >
            <BrandGradient style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View style={s.row}>
            {state.routes.map((route, index) => {
              const focused = index === state.index;
              const { options } = descriptors[route.key];
              const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;

              // same events as the stock tab bar, so tab listeners keep working
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.dispatch({ ...CommonActions.navigate({ name: route.name, merge: true }), target: state.key });
                }
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

              return (
                <TabItem
                  key={route.key}
                  focused={focused}
                  label={label}
                  icon={options.tabBarIcon}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  reduceMotion={reduceMotion}
                  // as the stock bar: iOS reads "Home, tab, 1 of 4"
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? (Platform.OS === 'ios' ? `${label}, tab, ${index + 1} of ${state.routes.length}` : undefined)}
                  testID={options.tabBarTestID}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function TabItem({
  focused,
  label,
  icon,
  onPress,
  onLongPress,
  reduceMotion,
  accessibilityLabel,
  testID,
}: {
  focused: boolean;
  label: string;
  icon: BottomTabNavigationOptions['tabBarIcon'];
  onPress: () => void;
  onLongPress: () => void;
  reduceMotion: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) lift.setValue(focused ? 1 : 0);
    else Animated.spring(lift, { toValue: focused ? 1 : 0, damping: 14, stiffness: 260, useNativeDriver: true }).start();
  }, [focused, reduceMotion, lift]);

  const color = focused ? '#fff' : DARK.muted;
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.9}
      style={s.item}
      // as the stock bar: VoiceOver doesn't announce role "tab" well, so iOS uses button plus the label above
      accessibilityRole={Platform.select({ ios: 'button', default: 'tab' })}
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View
        style={{
          transform: [
            { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        }}
      >
        {icon?.({ focused, color, size: 22 })}
      </Animated.View>
      <Text style={[s.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  wrap: { paddingTop: 6, backgroundColor: DARK.bg },
  fade: { position: 'absolute', top: -16, left: 0, right: 0, height: 16 },
  // the shadow lives outside the clipped pill, since clipping would cut it off on iOS
  shadow: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_WIDTH,
    borderRadius: HEIGHT / 2,
    backgroundColor: DARK.card,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  pill: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  rim: { position: 'absolute', top: 0, left: 24, right: 24, height: 1 },
  lens: {
    position: 'absolute',
    top: INSET - 1,
    left: INSET - 1,
    height: HEIGHT - INSET * 2,
    borderRadius: (HEIGHT - INSET * 2) / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  row: { flex: 1, flexDirection: 'row', paddingHorizontal: INSET - 1 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 12, fontFamily: FONTS.medium },
});
