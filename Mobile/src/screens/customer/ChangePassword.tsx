import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Field, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { apiMessage } from '../auth/SignIn';
import type { CustomerProfileStackParams } from '../../navigation/types';

export default function ChangePassword({ navigation }: NativeStackScreenProps<CustomerProfileStackParams, 'ChangePassword'>) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const longEnough = next.length >= 8;
  const hasSymbol = /[^A-Za-z0-9]/.test(next);
  const different = !!next && next !== current;
  const matches = !!next && next === confirm;
  const ready = !!current && longEnough && hasSymbol && different && matches;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { old_password: current, new_password: next });
      if (res.data?.success === false) throw new Error(res.data?.message);
      Alert.alert('Password changed', 'Use your new password next time you sign in.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('Could not change password', apiMessage(err, 'Check your current password and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const Rule = ({ ok, text }: { ok: boolean; text: string }) => (
    <View style={s.rule}>
      <Ionicons name={ok ? 'checkmark' : 'ellipse-outline'} size={16} color={ok ? DARK.accent : DARK.muted} />
      <Text style={[s.ruleText, ok && { color: DARK.accent }]}>{text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Change Password" onBack={() => navigation.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <Text style={s.lead}>The new password must be different from the current password</Text>
          <Field label="Current Password" placeholder="Enter your current password" value={current} onChangeText={setCurrent} secure autoComplete="current-password" textContentType="password" />
          <View style={{ gap: 12 }}>
            <Field label="New Password" placeholder="Enter your new password" value={next} onChangeText={setNext} secure autoComplete="new-password" textContentType="newPassword" />
            <View style={{ gap: 8, paddingLeft: 4 }}>
              <Rule ok={longEnough} text="At least 8 characters" />
              <Rule ok={hasSymbol} text="Includes a symbol like @ ! #" />
              <Rule ok={different} text="Different from your current password" />
            </View>
          </View>
          <Field label="Confirm Password" placeholder="Enter your new password again" value={confirm} onChangeText={setConfirm} secure autoComplete="new-password" textContentType="newPassword" />
          {!!confirm && !matches && <Text style={s.error}>Passwords don't match yet</Text>}
          <GradientButton title="Submit" onPress={submit} disabled={!ready} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  lead: { color: '#fff', fontSize: 20, lineHeight: 30, fontFamily: FONTS.medium },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  error: { color: '#fca5a5', fontSize: 13, fontFamily: FONTS.medium, marginTop: -8 },
});
