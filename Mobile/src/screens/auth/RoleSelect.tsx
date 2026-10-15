import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { socialSignIn } from '../../services/socialAuth';
import { apiMessage } from './SignIn';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams, SignupRole } from '../../navigation/types';

// CLIENT is the customer type the website registers too, so both apps create the same kind of account.
const ROLES: { value: SignupRole; label: string }[] = [
  { value: 'CLIENT', label: 'Customer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'EVENT_PLANNER', label: 'Event Planner' },
];

export default function RoleSelect({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'RoleSelect'>) {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<SignupRole>('CLIENT');
  const social = route.params?.social;
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);

  // Google / Apple sign-up: the account is created with the chosen role, no form needed
  const next = async () => {
    if (!social) return navigation.navigate('SignUp', { role });
    setBusy(true);
    try {
      await socialSignIn(social, login, role);
    } catch (err) {
      Alert.alert('Sign-up failed', apiMessage(err, 'Try again, or sign up with your email.'));
      setBusy(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 }]}>
      <View style={{ gap: 28 }}>
        <Text style={[ui.h1, { alignSelf: 'center', maxWidth: 280 }]}>To Get Started, Please Select Your Role</Text>
        <View style={{ gap: 12 }} accessibilityRole="radiogroup">
          <Text style={ui.label}>I am a</Text>
          {ROLES.map((r) => {
            const on = r.value === role;
            return (
              <Pressable
                key={r.value}
                onPress={() => setRole(r.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[s.option, on && s.optionOn]}
              >
                {on ? (
                  <BrandGradient style={s.radio}>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                  </BrandGradient>
                ) : (
                  <View style={[s.radio, s.radioOff]} />
                )}
                <Text style={[s.optionText, on && { color: '#fff' }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 20 }}>
        <GradientButton title={social ? `Continue with ${social.provider === 'apple' ? 'Apple' : 'Google'}` : 'Continue'} onPress={next} loading={busy} />
        <View style={s.footer}>
          <Text style={ui.muted}>Already have an account? </Text>
          <Pressable onPress={() => navigation.navigate('SignIn')} accessibilityRole="link" hitSlop={8}>
            <Text style={ui.link}>Login</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg, paddingHorizontal: 20, justifyContent: 'space-between' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: DARK.card,
    borderWidth: 1,
    borderColor: DARK.card,
  },
  optionOn: { borderColor: DARK.border },
  radio: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radioOff: { borderWidth: 1.5, borderColor: DARK.muted },
  optionText: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.medium },
  footer: { flexDirection: 'row', justifyContent: 'center' },
});
