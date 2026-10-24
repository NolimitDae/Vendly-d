import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventPlannerService } from '../../services/eventplanner.service';
import { apiMessage } from '../auth/SignIn';
import { useAuth } from '../../context/AuthContext';

const EVENT_TYPES = [
  { label: 'Wedding', value: 'WEDDING' },
  { label: 'Birthday', value: 'BIRTHDAY' },
  { label: 'Corporate', value: 'CORPORATE' },
  { label: 'Concert', value: 'CONCERT' },
  { label: 'Conference', value: 'CONFERENCE' },
  { label: 'Private party', value: 'PRIVATE_PARTY' },
  { label: 'Other', value: 'OTHER' },
];

/** The public planner profile Vendly reviews before a planner can create client events. */
export default function PlannerProfile() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({ business_name: '', bio: '', website: '', instagram: '', years_experience: '', team_size: '' });
  const [types, setTypes] = useState<string[]>([]);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useFocusEffect(
    useCallback(() => {
      EventPlannerService.getMyProfile()
        .then((r) => {
          const p = r.data?.data;
          if (!r.data?.success || !p) return;
          setStatus(p.license_status);
          setForm({ business_name: p.business_name ?? '', bio: p.bio ?? '', website: p.website ?? '', instagram: p.instagram ?? '', years_experience: p.years_experience ? String(p.years_experience) : '', team_size: p.team_size ? String(p.team_size) : '' });
          setTypes(p.event_types ?? []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const save = async () => {
    if (!form.business_name.trim()) return Alert.alert('Business name', 'Tell clients who they are booking.');
    setSaving(true);
    try {
      const res = await EventPlannerService.upsertProfile({
        business_name: form.business_name.trim(),
        bio: form.bio.trim() || undefined,
        website: form.website.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        years_experience: form.years_experience ? Number(form.years_experience) : undefined,
        team_size: form.team_size ? Number(form.team_size) : undefined,
        event_types: types,
      });
      if (res.data?.success === false) throw new Error(res.data?.message);
      Alert.alert('Saved', status === 'APPROVED' ? 'Your profile is updated.' : 'Vendly will review your profile before you can create client events.', [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (err) {
      Alert.alert('Could not save', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <ScreenHeader title="Planner Profile" onBack={() => nav.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          {status && (
            <View style={s.note}>
              <Ionicons name={status === 'APPROVED' ? 'shield-checkmark-outline' : 'time-outline'} size={18} color={status === 'APPROVED' ? '#6ee7c7' : '#fcd34d'} />
              <Text style={s.noteText}>{status === 'APPROVED' ? 'Verified by Vendly. Clients can see this profile.' : status === 'SUSPENDED' ? 'This profile is suspended. Contact support.' : 'Pending review. You can edit while you wait.'}</Text>
            </View>
          )}
          {status === 'APPROVED' && !!user && (
            <Pressable onPress={() => nav.navigate('PlannerPublic', { userId: user.id })} accessibilityRole="link" hitSlop={8}>
              <Text style={s.link}>See your public profile</Text>
            </Pressable>
          )}
          <Field label="Business Name" placeholder="e.g. Bloom Events Co." value={form.business_name} onChangeText={set('business_name')} />
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Description</Text>
            <View style={[ui.field, s.textarea]}>
              <Ionicons name="pencil-outline" size={20} color={DARK.muted} style={{ marginTop: 2 }} />
              <TextInput style={[ui.input, { minHeight: 120, textAlignVertical: 'top' }]} placeholder="Tell clients about yourself and your experience..." placeholderTextColor={DARK.muted} value={form.bio} onChangeText={set('bio')} multiline />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Event Types</Text>
            <View style={s.chips}>{EVENT_TYPES.map((t) => <Chip key={t.value} label={t.label} active={types.includes(t.value)} onPress={() => setTypes((p) => (p.includes(t.value) ? p.filter((x) => x !== t.value) : [...p, t.value]))} />)}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="Years Experience" placeholder="5" value={form.years_experience} onChangeText={(t) => set('years_experience')(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Team Size" placeholder="3" value={form.team_size} onChangeText={(t) => set('team_size')(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          </View>
          <Field label="Website" placeholder="https://" value={form.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" />
          <Field label="Instagram" placeholder="@yourstudio" value={form.instagram} onChangeText={set('instagram')} autoCapitalize="none" />
          <GradientButton title="Save" onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: DARK.card },
  noteText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  textarea: { height: undefined, paddingVertical: 14, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
});
