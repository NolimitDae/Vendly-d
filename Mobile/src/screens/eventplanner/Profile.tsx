import React, { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GradientButton } from '../../components/brand';
import DeleteAccountButton from '../../components/contracts/DeleteAccountButton';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { EventPlannerService, type EventPlannerProfile } from '../../services/eventplanner.service';

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; note?: string; noteColor?: string };

const STATUS: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'Verified', color: '#6ee7c7' },
  PENDING: { label: 'Pending review', color: '#fcd34d' },
  SUSPENDED: { label: 'Suspended', color: '#fca5a5' },
};

export default function EPProfile() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<EventPlannerProfile | null>(null);
  const [confirm, setConfirm] = useState(false);
  const firstName = (user?.name ?? '').split(' ')[0];

  useFocusEffect(
    useCallback(() => {
      EventPlannerService.getMyProfile().then((r) => r.data?.success && setProfile(r.data.data)).catch(() => {});
    }, []),
  );

  const st = STATUS[profile?.license_status ?? ''] ?? { label: 'Set up', color: DARK.muted };
  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Business',
      items: [
        { icon: 'briefcase-outline', label: 'Planner profile', note: st.label, noteColor: st.color, onPress: () => nav.navigate('PlannerProfile') },
        { icon: 'person-outline', label: 'Profile', onPress: () => nav.navigate('EditProfile') },
      ],
    },
    { title: 'Manage Requests', items: [{ icon: 'notifications-outline', label: 'Notifications', onPress: () => nav.navigate('Notifications') }] },
    { title: 'Security', items: [{ icon: 'lock-closed-outline', label: 'Change Password', onPress: () => nav.navigate('ChangePassword') }] },
  ];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40, paddingHorizontal: 20 }}>
        <Text style={s.title}>Settings</Text>
        <View style={s.hero}>
          <View style={s.avatar}>
            {user?.avatar_url ? <Image source={{ uri: user.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{(firstName[0] ?? 'P').toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.hello} numberOfLines={1}>Hello {firstName || 'there'}!</Text>
            <View style={s.meta}>
              <Ionicons name="briefcase-outline" size={18} color="#fff" />
              <Text style={s.metaText} numberOfLines={1}>{profile?.business_name || 'Event planner'}</Text>
            </View>
          </View>
        </View>

        {sections.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            {sec.items.map((it) => (
              <Pressable key={it.label} style={s.item} onPress={it.onPress} accessibilityRole="button">
                <Ionicons name={it.icon} size={24} color="#fff" />
                <Text style={s.itemText}>{it.label}</Text>
                {it.note && <Text style={[s.note, it.noteColor ? { color: it.noteColor } : null]}>{it.note}</Text>}
                <Ionicons name="chevron-forward" size={20} color={DARK.muted} />
              </Pressable>
            ))}
          </View>
        ))}

        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <Pressable style={s.item} onPress={() => setConfirm(true)} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={24} color="#fff" />
            <Text style={s.itemText}>Logout</Text>
          </Pressable>
          <View style={{ marginTop: 12 }}><DeleteAccountButton /></View>
        </View>
      </ScrollView>

      <Modal visible={confirm} transparent animationType="slide" onRequestClose={() => setConfirm(false)}>
        <Pressable style={s.overlay} onPress={() => setConfirm(false)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 24 }]} onPress={() => {}}>
            <Pressable onPress={() => setConfirm(false)} style={{ alignSelf: 'flex-end' }} accessibilityLabel="Close" hitSlop={10}><Ionicons name="close" size={26} color="#fff" /></Pressable>
            <Text style={s.sheetTitle}>Are you sure you want to log out?</Text>
            <Text style={s.sheetBody}>Thank you and see you again</Text>
            <View style={s.sheetActions}>
              <Pressable style={s.outline} onPress={() => setConfirm(false)} accessibilityRole="button"><Text style={s.outlineText}>Cancel</Text></Pressable>
              <GradientButton title="Yes, Log Out" onPress={() => { setConfirm(false); logout(); }} style={{ flex: 1.4 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  title: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold, textAlign: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 28 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  hello: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#fff', fontSize: 16, fontFamily: FONTS.regular, flexShrink: 1 },
  section: { marginTop: 28, gap: 4 },
  sectionTitle: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  itemText: { flex: 1, color: '#fff', fontSize: 18, fontFamily: FONTS.regular },
  note: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: DARK.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 20, gap: 12, alignItems: 'center' },
  sheetTitle: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold, textAlign: 'center', marginTop: 24 },
  sheetBody: { color: '#fff', fontSize: 16, fontFamily: FONTS.regular, textAlign: 'center', marginBottom: 24 },
  sheetActions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
