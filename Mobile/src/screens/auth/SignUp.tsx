import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../services/api';
import { BackButton, BrandGradient, Field, GradientButton, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { AuthStackParams } from '../../navigation/types';
import { apiMessage } from './SignIn';

export default function SignUp({ navigation, route }: NativeStackScreenProps<AuthStackParams, 'SignUp'>) {
  const { role } = route.params;
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', business_name: '' });
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const business = role !== 'CLIENT';

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!res.canceled) setPhoto(res.assets[0]);
  };

  const submit = async () => {
    const email = form.email.trim();
    if (!form.first_name.trim() || !form.last_name.trim() || !email || !form.password) {
      return Alert.alert('Missing details', 'Fill in your name, email and a password.');
    }
    if (form.password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    if (business && !form.business_name.trim()) return Alert.alert('Missing details', 'Add your business name.');

    const body = new FormData();
    body.append('first_name', form.first_name.trim());
    body.append('last_name', form.last_name.trim());
    body.append('email', email);
    body.append('password', form.password);
    body.append('type', role);
    if (business) body.append('business_name', form.business_name.trim());
    if (photo) {
      body.append('image', {
        uri: photo.uri,
        name: photo.fileName ?? 'avatar.jpg',
        type: photo.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/register', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      // Errors come back as 200s without success: true (e.g. { statusCode: 401, message: 'Email already exist' }).
      if (res.data?.success !== true) throw new Error(res.data?.message ?? 'Could not create your account');
      navigation.navigate('VerifyEmail', { email, password: form.password });
    } catch (err) {
      Alert.alert('Sign up failed', apiMessage(err, 'Could not create your account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={s.topTitle}>Sign Up</Text>
          <View style={{ width: 48 }} />
        </View>

        <View style={s.header}>
          <Text style={ui.h1}>Complete Your Account</Text>
          <Text style={ui.body}>Fill your information below to create your Vendly account.</Text>
        </View>

        <View style={s.form}>
          <Pressable onPress={pickPhoto} style={s.avatar} accessibilityRole="button" accessibilityLabel="Add profile photo">
            {photo ? (
              <Image source={{ uri: photo.uri }} style={s.avatarImg} />
            ) : (
              <Ionicons name="person-outline" size={54} color={DARK.muted} />
            )}
            <BrandGradient style={s.avatarBadge}>
              <Ionicons name="image-outline" size={14} color="#fff" />
            </BrandGradient>
          </Pressable>

          <View style={{ gap: 16 }}>
            <Field label="First Name" placeholder="Enter your first name" value={form.first_name} onChangeText={set('first_name')} autoComplete="given-name" textContentType="givenName" />
            <Field label="Last Name" placeholder="Enter your last name" value={form.last_name} onChangeText={set('last_name')} autoComplete="family-name" textContentType="familyName" />
            {business && (
              <Field label="Business Name" placeholder="Enter your business name" value={form.business_name} onChangeText={set('business_name')} autoComplete="organization" />
            )}
            <Field
              label="Email"
              placeholder="Enter your email address"
              value={form.email}
              onChangeText={set('email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              placeholder="At least 8 characters"
              value={form.password}
              onChangeText={set('password')}
              secure
              autoComplete="new-password"
              textContentType="newPassword"
            />
          </View>

          <GradientButton title="Create New Account" onPress={submit} loading={loading} style={{ marginTop: 10 }} />
          <View style={s.footer}>
            <Text style={ui.muted}>Already have an account? </Text>
            <Pressable onPress={() => navigation.navigate('SignIn')} accessibilityRole="link" hitSlop={8}>
              <Text style={ui.link}>Login</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  topTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  header: { gap: 8, paddingHorizontal: 32, marginTop: 28, marginBottom: 28 },
  form: { paddingHorizontal: 20, gap: 18 },
  avatar: {
    alignSelf: 'center',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: DARK.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 118, height: 118, borderRadius: 59 },
  avatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: DARK.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 6 },
});
