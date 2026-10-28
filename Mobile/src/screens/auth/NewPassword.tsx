import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { BackButton, Field, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { signIn } from './SignIn';
import { codeMessage, PASSWORD_RULES } from './ResetPassword';

/** Step 3: the new password, after the emailed code checked out. Signs the user straight in afterwards. */
export default function NewPassword({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'NewPassword'>) {
  const { email, code } = route.params;
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const rulesOk = PASSWORD_RULES.every((r) => r.test(password));

  const save = async () => {
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
      // usually the code ran out (15 minutes): back to the code page for a new one
      Alert.alert('Could not reset', codeMessage(err, 'Your code has expired. Send a new one and try again.'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setLoading(false);
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
            <Text style={ui.h1}>Set a new password</Text>
            <Text style={s.sub}>Choose a new password for {email}.</Text>
          </View>
          <Field label="New password" placeholder="New password" value={password} onChangeText={setPassword} secure autoComplete="password-new" textContentType="newPassword" autoFocus />
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
          <Field label="Confirm password" placeholder="Type it again" value={confirm} onChangeText={setConfirm} secure autoComplete="password-new" textContentType="newPassword" onSubmitEditing={save} />
          <GradientButton title="Reset password" onPress={save} loading={loading} disabled={!password || !confirm} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  body: { paddingHorizontal: 20, marginTop: 28, gap: 24 },
  sub: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium, textAlign: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
});
