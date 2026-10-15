import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { BackButton, Field, GradientButton, ui } from '../../components/brand';
import CodeInput from '../../components/CodeInput';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { apiMessage, signIn } from './SignIn';

/** What a password needs, shown as a live checklist. */
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
];

/** Step 2: the emailed code plus the new password. Signs the user straight in afterwards. */
export default function ResetPassword({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'ResetPassword'>) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const rulesOk = PASSWORD_RULES.every((r) => r.test(password));

  const reset = async () => {
    if (code.length !== 6) return Alert.alert('Code', 'Enter the 6-digit code from the email.');
    if (!rulesOk) return Alert.alert('Password', 'Use at least 8 characters.');
    if (password !== confirm) return Alert.alert('Password', 'The two passwords don’t match.');
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { email, token: code, password });
      if (res.data?.success === false) throw new Error(res.data?.message);
      try {
        await signIn(email, password, login);
      } catch {
        Alert.alert('Password changed', 'Sign in with your new password.', [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }]);
      }
    } catch (err) {
      Alert.alert('Could not reset', apiMessage(err, 'That code didn’t work or has expired. Codes last 5 minutes.'));
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
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 20 }}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={s.body}>
          <View style={{ gap: 8 }}>
            <Text style={ui.h1}>Set a new password</Text>
            <Text style={s.sub}>Enter the code we sent to {email}, then choose a new password.</Text>
          </View>
          <CodeInput value={code} onChange={setCode} />
          <View style={s.resend}>
            <Text style={ui.muted}>Didn’t get it? </Text>
            <Pressable onPress={resend} accessibilityRole="button" hitSlop={8}><Text style={ui.link}>Send a new code</Text></Pressable>
          </View>
          <Field label="New password" placeholder="New password" value={password} onChangeText={setPassword} secure autoComplete="password-new" textContentType="newPassword" />
          <View style={{ gap: 6, marginTop: -10 }}>
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <View key={r.label} style={s.rule}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? '#5BD69A' : DARK.muted} />
                  <Text style={[s.ruleText, ok && { color: '#fff' }]}>{r.label}</Text>
                </View>
              );
            })}
          </View>
          <Field label="Confirm password" placeholder="Type it again" value={confirm} onChangeText={setConfirm} secure autoComplete="password-new" textContentType="newPassword" onSubmitEditing={reset} />
          <GradientButton title="Reset password" onPress={reset} loading={loading} disabled={code.length !== 6 || !password || !confirm} />
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
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
});
