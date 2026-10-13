import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { useAuth, type AuthContextValue } from '../../context/AuthContext';
import { Field, GradientButton, OutlineButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';

/**
 * Logs in and loads the profile. The API returns { authorization: { access_token, refresh_token } };
 * the user record comes from /auth/me. Throws the API's message on failure.
 */
export async function signIn(email: string, password: string, login: AuthContextValue['login']) {
  const res = await api.post('/auth/login', { email: email.trim(), password });
  const auth = res.data?.authorization;
  if (!res.data?.success || !auth?.access_token) throw new Error(res.data?.message ?? 'Invalid credentials');
  const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${auth.access_token}` } });
  await login(auth.access_token, me.data?.data, auth.refresh_token);
}

export const apiMessage = (err: any, fallback: string): string => {
  const m = err?.response?.data?.message ?? err?.message;
  return Array.isArray(m) ? m[0] : m || fallback;
};

const comingSoon = () => Alert.alert('Coming soon', 'Google and Apple sign-in are on the way. Use your email for now.');

export default function SignIn({ navigation }: NativeStackScreenProps<AuthStackParams, 'SignIn'>) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return Alert.alert('Missing details', 'Enter your email and password.');
    setLoading(true);
    try {
      await signIn(email, password, login);
    } catch (err) {
      const msg = apiMessage(err, 'Login failed');
      // Unverified accounts can't log in: send them to the code screen with a fresh code.
      if (/verify your email/i.test(msg)) {
        api.post('/auth/resend-verification-email', { email: email.trim() }).catch(() => {});
        navigation.navigate('VerifyEmail', { email: email.trim(), password });
      } else {
        Alert.alert('Login failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[s.welcome, { paddingTop: insets.top + 36 }]}>
          <Text style={ui.h1}>Hi, Welcome Back! 👋</Text>
          <Text style={s.sub}>Sign in to continue to Vendly</Text>
        </View>

        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={{ gap: 16 }}>
            <Field
              label="Email"
              placeholder="Enter your email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
            />
          </View>

          <GradientButton title="Continue with Email" onPress={submit} loading={loading} style={{ marginTop: 28 }} />

          <View style={s.or}>
            <View style={s.line} />
            <Text style={s.orText}>Or continue with</Text>
            <View style={s.line} />
          </View>

          <View style={{ gap: 16 }}>
            <OutlineButton title="Continue with Google" icon={<Ionicons name="logo-google" size={22} color="#fff" />} onPress={comingSoon} />
            <OutlineButton title="Continue with Apple" icon={<Ionicons name="logo-apple" size={24} color="#fff" />} onPress={comingSoon} />
          </View>

          <View style={s.footer}>
            <Text style={ui.muted}>Don’t have an account? </Text>
            <Pressable onPress={() => navigation.navigate('RoleSelect')} accessibilityRole="link" hitSlop={8}>
              <Text style={ui.link}>Sign Up</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  welcome: { alignItems: 'center', gap: 4, paddingBottom: 36, paddingHorizontal: 20 },
  sub: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  sheet: {
    flexGrow: 1,
    backgroundColor: DARK.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  or: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 28 },
  line: { width: 62, height: 1, backgroundColor: DARK.muted, opacity: 0.5 },
  orText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
});
