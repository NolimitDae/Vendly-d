import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { BackButton, GradientButton, ui } from '../../components/brand';
import CodeInput from '../../components/CodeInput';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { apiMessage } from './SignIn';

/** What a password needs, shown as a live checklist. */
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
];

/** The server's code answers, in plain words. */
export function codeMessage(err: unknown, fallback: string) {
  const m = apiMessage(err, fallback);
  if (/invalid token/i.test(m)) return 'That code isn’t right. Check the email, or send a new code.';
  if (/expired/i.test(m)) return 'That code has expired. Send a new one.';
  return m;
}

/** Step 2: the emailed code. Once it checks out, the new password is chosen on the next page. */
export default function ResetPassword({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'ResetPassword'>) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (code.length !== 6) return Alert.alert('Code', 'Enter the 6-digit code from the email.');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-token', { email, token: code });
      // coming back to this page after checking the code once: it still works for the reset
      const ok = res.data?.success !== false || res.data?.message === 'Token already verified';
      if (!ok) throw new Error(res.data?.message);
      navigation.navigate('NewPassword', { email, code });
    } catch (err) {
      Alert.alert('That code didn’t work', codeMessage(err, 'Check the code, or send a new one. Codes last 15 minutes.'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await api.post('/auth/forgot-password', { email });
      setCode('');
      Alert.alert('Code sent', `We sent a new code to ${email}.`);
    } catch (err) {
      Alert.alert('Could not resend', apiMessage(err, 'Try again in a minute.'));
    }
  };

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top + 8 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={{ paddingHorizontal: 20 }}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={s.body}>
          <View style={{ gap: 8 }}>
            <Text style={ui.h1}>Enter your code</Text>
            <Text style={s.sub}>We sent a 6-digit code to {email}.</Text>
          </View>
          <CodeInput value={code} onChange={setCode} />
          <View style={s.resend}>
            <Text style={ui.muted}>Didn’t get it? </Text>
            <Pressable onPress={resend} accessibilityRole="button" hitSlop={8}><Text style={ui.link}>Send a new code</Text></Pressable>
          </View>
          <GradientButton title="Continue" onPress={verify} loading={loading} disabled={code.length !== 6} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  body: { paddingHorizontal: 20, marginTop: 28, gap: 24 },
  sub: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium, textAlign: 'center' },
  resend: { flexDirection: 'row', justifyContent: 'center', marginTop: -12 },
});
