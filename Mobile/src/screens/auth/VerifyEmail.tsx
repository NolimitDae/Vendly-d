import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { BackButton, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { apiMessage, signIn } from './SignIn';

const LENGTH = 6;

export default function VerifyEmail({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'VerifyEmail'>) {
  const { email, password } = route.params;
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-email', { email, token: code });
      if (res.data?.success !== true) throw new Error(res.data?.message ?? 'That code didn’t work');
      // Signing in straight away saves typing the password again; it's only kept in memory for this flow.
      if (password) await signIn(email, password, login);
      else navigation.replace('SignIn');
    } catch (err) {
      Alert.alert('Verification failed', apiMessage(err, 'That code didn’t work. Check it or send a new one.'));
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await api.post('/auth/resend-verification-email', { email });
      setCode('');
      Alert.alert('Code sent', `We sent a new code to ${email}.`);
    } catch (err) {
      Alert.alert('Could not resend', apiMessage(err, 'Try again in a minute.'));
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <View style={{ paddingHorizontal: 20 }}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <View style={s.body}>
        <View style={{ gap: 8 }}>
          <Text style={ui.h1}>Verify your new account</Text>
          <Text style={s.sub}>We sent a 6-digit code to {email}. Enter it below to verify your account.</Text>
        </View>

        {/* One invisible input laid over the six boxes drives them, so tapping, paste and code autofill all work. */}
        <View style={s.boxes}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <View key={i} style={[s.box, i === code.length && s.boxActive]}>
              <Text style={s.digit}>{code[i] ?? ''}</Text>
            </View>
          ))}
          <TextInput
            accessibilityLabel="Verification code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={LENGTH}
            autoFocus
            caretHidden
            style={s.overlay}
          />
        </View>

        <GradientButton title="Verify" onPress={verify} loading={loading} disabled={code.length !== LENGTH} />

        <View style={s.footer}>
          <Text style={ui.muted}>Didn’t get it? </Text>
          <Pressable onPress={resend} accessibilityRole="button" hitSlop={8}>
            <Text style={ui.link}>Send a new code</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  body: { paddingHorizontal: 20, marginTop: 28, gap: 28 },
  sub: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium, textAlign: 'center' },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    maxWidth: 50,
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: DARK.border },
  digit: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  overlay: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: -8 },
});
