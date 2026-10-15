import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { DARK } from '../constants/colors';

/** A softly pulsing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: { width?: DimensionValue; height?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: DARK.field, opacity: pulse }, style]} />;
}

/** Placeholder for a listing card (image, title, two meta lines). */
export function ListingCardSkeleton({ width = 243 }: { width?: DimensionValue }) {
  return (
    <View style={[s.card, { width }]} accessibilityLabel="Loading">
      <Skeleton height={121} radius={12} />
      <Skeleton width="70%" height={16} style={{ marginTop: 10 }} />
      <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="55%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
}

/** Placeholder for a full-width result row. */
export function ResultRowSkeleton() {
  return (
    <View style={s.row} accessibilityLabel="Loading">
      <Skeleton width={110} height={110} radius={14} />
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        <Skeleton width="80%" height={16} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="35%" height={14} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, borderRadius: 16, backgroundColor: DARK.card },
  row: { flexDirection: 'row', gap: 12, marginHorizontal: 20, padding: 12, borderRadius: 16, backgroundColor: DARK.card },
});
