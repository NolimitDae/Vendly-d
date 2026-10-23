import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { IdentityService, ROLE_BLURB, ROLE_LABEL, RolesInfo, SwitchableRole } from '../../services/identity.service';
import { haptic } from '../../utils/haptics';

const apiMessage = (e: any, fallback: string) => {
  const m = e?.response?.data?.message ?? e?.message;
  return (Array.isArray(m) ? m[0] : m) || fallback;
};

/** One login, several roles: switch between customer, vendor and planner (needs a verified ID). */
export default function SwitchRole() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { login, refreshUser } = useAuth();
  const [info, setInfo] = useState<RolesInfo | null>(null);
  const [busy, setBusy] = useState<SwitchableRole | null>(null);
  const [addingVendor, setAddingVendor] = useState(false);
  const [businessName, setBusinessName] = useState('');

  useFocusEffect(
    useCallback(() => {
      IdentityService.roles()
        .then((res) => setInfo(res.data?.data ?? null))
        .catch(() => setInfo(null));
    }, []),
  );

  const doSwitch = async (role: SwitchableRole) => {
    if (!info) return;
    if (role === 'VENDOR' && !info.roles.includes('VENDOR') && !addingVendor) return setAddingVendor(true);
    setBusy(role);
    try {
      const res = await IdentityService.switchRole(role, role === 'VENDOR' ? businessName.trim() || undefined : undefined);
      const auth = res.data?.authorization;
      if (!res.data?.success) throw new Error(res.data?.message);
      haptic.success();
      const label = ROLE_LABEL[role].toLowerCase();
      // a new role is greeted by its welcome popup instead (iOS won't show that popup over an alert)
      if (!res.data.added) Alert.alert('Switched', `You're now using Vendly as ${label === 'event planner' ? 'an event planner' : `a ${label}`}.`);
      // Updating the signed-in user to the new role swaps the whole app to that role's tabs.
      if (auth?.access_token) {
        const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${auth.access_token}` } });
        await login(auth.access_token, me.data?.data, auth.refresh_token);
      } else {
        await refreshUser(); // the current token already carries the new role
      }
    } catch (e) {
      Alert.alert('Couldn’t switch', apiMessage(e, 'Please try again.'));
      setBusy(null);
    }
  };

  const id = info?.id_verification;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Switch role" onBack={() => nav.goBack()} />
      {!info ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>Use one login as a customer, vendor and planner.</Text>

          {!id?.verified && (
            <Pressable
              style={[s.notice, id?.status === 'REJECTED' && { borderColor: '#F87171' }]}
              onPress={() => id?.status !== 'PENDING' && nav.navigate('VerifyIdentity')}
              accessibilityRole="button"
              disabled={id?.status === 'PENDING'}
            >
              <Ionicons name={id?.status === 'PENDING' ? 'time-outline' : id?.status === 'REJECTED' ? 'alert-circle-outline' : 'id-card-outline'} size={24} color={id?.status === 'REJECTED' ? '#F87171' : '#F5B700'} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.noticeTitle}>
                  {id?.status === 'PENDING' ? 'We’re reviewing your ID' : id?.status === 'REJECTED' ? 'We couldn’t verify your ID' : 'Verify your ID to switch roles'}
                </Text>
                <Text style={s.noticeBody}>
                  {id?.status === 'PENDING'
                    ? 'Usually within one business day. We’ll notify you when it’s done.'
                    : id?.status === 'REJECTED'
                      ? `${id.rejection_reason ?? ''} Tap to upload new photos.`.trim()
                      : 'To keep everyone safe, we check your ID once before you switch or add a role.'}
                </Text>
              </View>
              {id?.status !== 'PENDING' && <Ionicons name="chevron-forward" size={20} color={DARK.muted} />}
            </Pressable>
          )}

          {info.available.map((role) => {
            const current = info.active === role;
            const held = info.roles.includes(role);
            const locked = !id?.verified;
            return (
              <View key={role} style={[s.card, current && s.cardActive]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.cardTitle}>{ROLE_LABEL[role]}</Text>
                    {current && <Text style={s.badge}>In use</Text>}
                  </View>
                  <Text style={s.cardBody}>{ROLE_BLURB[role]}</Text>
                  {role === 'VENDOR' && addingVendor && !held && (
                    <TextInput
                      style={s.input}
                      value={businessName}
                      onChangeText={setBusinessName}
                      placeholder="Business name (optional)"
                      placeholderTextColor={DARK.muted}
                      maxLength={255}
                      accessibilityLabel="Business name"
                    />
                  )}
                </View>
                {!current && (
                  <Pressable
                    style={[s.btn, (locked || busy !== null) && { opacity: 0.45 }]}
                    onPress={() => doSwitch(role)}
                    disabled={locked || busy !== null}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: locked || busy !== null }}
                  >
                    {busy === role ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.btnText}>{held ? 'Switch' : role === 'VENDOR' && addingVendor ? 'Become vendor' : 'Add'}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
          {(info.roles.includes('VENDOR') || addingVendor) && (
            <Text style={s.foot}>New vendors still upload a business licence for approval before their services go live.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  lead: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: '#F5B70066' },
  noticeTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  noticeBody: { color: DARK.muted, fontSize: 13, lineHeight: 18, fontFamily: FONTS.regular },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.field },
  cardActive: { borderColor: DARK.accent },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  cardBody: { color: DARK.muted, fontSize: 13, lineHeight: 18, fontFamily: FONTS.regular },
  badge: { color: '#4ADE80', fontSize: 12, fontFamily: FONTS.medium },
  input: { marginTop: 8, height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: DARK.field, color: '#fff', fontFamily: FONTS.regular },
  btn: { minWidth: 92, height: 40, paddingHorizontal: 14, borderRadius: 99, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  foot: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.regular },
});
