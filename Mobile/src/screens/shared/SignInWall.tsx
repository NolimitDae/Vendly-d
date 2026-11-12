import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../../components/brand';
import { useAuth } from '../../context/AuthContext';

const WHY: Record<string, string> = {
  SelectDate: 'book this',
  BookingDetails: 'book this',
  BookingSummary: 'book this',
  RentalCheckout: 'rent this',
  Notifications: 'see your notifications',
};

/**
 * Shown to someone browsing without an account when they go somewhere that needs one (booking,
 * renting, notifications): sign in, create a free account, or go back to browsing.
 */
export default function SignInWall() {
  const nav = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { leaveGuest } = useAuth();
  const why = WHY[route.name] ?? 'continue';
  return (
    <View style={[s.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Pressable onPress={() => nav.goBack()} style={s.back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </Pressable>
      <View style={s.body}>
        <Ionicons name="person-circle-outline" size={64} color={DARK.accent} />
        <Text style={s.title}>Sign in to {why}</Text>
        <Text style={s.text}>Create a free Vendly account or sign in to book vendors, message them and keep track of your events. Your payment is held safely until the job is done.</Text>
      </View>
      <View style={{ gap: 12 }}>
        <GradientButton title="Sign in" onPress={() => void leaveGuest('SignIn')} />
        <Pressable onPress={() => void leaveGuest('RoleSelect')} style={s.secondary} accessibilityRole="button">
          <Text style={s.secondaryText}>Create a free account</Text>
        </Pressable>
        <Pressable onPress={() => nav.goBack()} style={s.secondary} accessibilityRole="button">
          <Text style={s.mutedText}>Keep browsing</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg, paddingHorizontal: 24 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontFamily: FONTS.bold, fontSize: 22, textAlign: 'center' },
  text: { color: DARK.muted, fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  secondary: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: DARK.accent, fontFamily: FONTS.semibold, fontSize: 16 },
  mutedText: { color: DARK.muted, fontFamily: FONTS.medium, fontSize: 15 },
});
