import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FONTS } from '../constants/colors';

/** Marks a test vendor's package or shop (Admin → Settings → Test vendors): bookings with them aren't real. */
export default function TestBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.badge, style]} accessibilityLabel="Test vendor">
      <Text style={s.text}>TEST</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: '#FDE68A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: '#78350F', fontSize: 11, letterSpacing: 0.5, fontFamily: FONTS.bold },
});
