import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { BackButton, BrandGradient, Field, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { apiMessage } from './SignIn';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Step 1 of a password reset: ask for the email and send a 6-digit code. */
export default function ForgotPassword({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'ForgotPassword'>) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) return Alert.alert('Email', 'Enter the email address you signed up with.');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: e });
      // the API answers the same whether or not the email has an account, so we always move on
      navigation.navigate('ResetPassword', { email: e });
    } catch (err) {
      Alert.alert('Could not send the code', apiMessage(err, 'Try again in a minute.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top + 8 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: 20 }}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <View style={s.body}>
        <BrandGradient style={s.icon}>
          <Ionicons name="lock-closed-outline" size={34} color="#fff" />
        </BrandGradient>
        <View style={{ gap: 8 }}>
          <Text style={ui.h1}>Forgot your password?</Text>
          <Text style={s.sub}>Enter your email and we’ll send you a 6-digit code to set a new one.</Text>
        </View>
        <Field label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" onSubmitEditing={send} />
        <GradientButton title="Send code" onPress={send} loading={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  body: { paddingHorizontal: 20, marginTop: 28, gap: 24 },
  icon: { width: 76, height: 76, borderRadius: 38, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  sub: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium, textAlign: 'center' },
});
