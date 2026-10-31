import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { Card, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { apiMessage } from '../auth/SignIn';

type Doc = { uri: string; name: string; type: string; size?: number };

const STATUS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string }> = {
  APPROVED: { icon: 'shield-checkmark', color: '#5BD69A', title: 'Verified', body: 'Your business is verified. Customers see the verified badge on your profile.' },
  REJECTED: { icon: 'close-circle', color: '#FF8A8A', title: 'Not approved', body: 'We couldn’t verify the document you sent. Upload a clear, current business licence or permit and we’ll review it again.' },
  PENDING: { icon: 'time', color: '#F5B700', title: 'In review', body: 'Vendly reviews licences within two business days. You can keep setting up your packages meanwhile.' },
  NONE: { icon: 'cloud-upload-outline', color: DARK.accent, title: 'Not uploaded yet', body: 'Upload your business licence or permit (photo or PDF) to get the verified badge and publish packages.' },
};

/** Vendor business verification: upload a licence (up to 2 files, images or PDF, 5 MB each). */
export default function License() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const u = user as any;
  const status = u?.license_uploaded || u?.license_status === 'APPROVED' ? (u?.license_status ?? 'PENDING') : 'NONE';
  const st = STATUS[status] ?? STATUS.PENDING;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const picked = res.assets.slice(0, 2).map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf', size: a.size }));
    const big = picked.find((d) => (d.size ?? 0) > 5 * 1024 * 1024);
    if (big) return Alert.alert('Too large', `${big.name} is over 5 MB.`);
    setDocs(picked);
  };

  const upload = async () => {
    if (!docs.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      docs.forEach((d) => fd.append('license', d as unknown as Blob));
      const res = await api.post('/auth/add-license', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success === false) throw new Error(res.data?.message);
      setDocs([]);
      await refreshUser();
      Alert.alert('Sent for review', 'Thanks! We’ll let you know once your business is verified.');
    } catch (err) {
      Alert.alert('Upload failed', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
      <ScreenHeader title="Verification" onBack={() => nav.goBack()} />
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Card style={s.status}>
          <Ionicons name={st.icon} size={40} color={st.color} />
          <Text style={[s.title, { color: st.color }]}>{st.title}</Text>
          <Text style={s.body}>{st.body}</Text>
        </Card>

        {status !== 'APPROVED' && (
          <>
            <View style={s.note}>
              <Ionicons name="information-circle-outline" size={18} color={DARK.accent} />
              <Text style={s.noteText}>
                No business licence? Upload a screenshot of your business’s social media page or website instead. To publish packages you need this approved and a verified photo ID (driver’s licence, passport or another government ID).
              </Text>
            </View>
            <Pressable onPress={() => nav.navigate('VerifyIdentity' as never)} accessibilityRole="link" hitSlop={6}>
              <Text style={s.noteLink}>Verify your ID</Text>
            </Pressable>
            <Pressable style={s.drop} onPress={pick} accessibilityRole="button">
              <Ionicons name="document-attach-outline" size={28} color={DARK.accent} />
              <Text style={s.dropTitle}>{docs.length ? 'Change files' : 'Choose your licence'}</Text>
              <Text style={s.muted}>Photo or PDF · up to 2 files · 5 MB each</Text>
            </Pressable>
            {docs.map((d) => (
              <View key={d.uri} style={s.doc}>
                {d.type.startsWith('image/') ? <Image source={{ uri: d.uri }} style={s.thumb} /> : <View style={[s.thumb, s.pdf]}><Ionicons name="document-text-outline" size={22} color={DARK.accent} /></View>}
                <Text style={s.docName} numberOfLines={1}>{d.name}</Text>
                <Pressable onPress={() => setDocs((p) => p.filter((x) => x.uri !== d.uri))} hitSlop={8} accessibilityLabel={`Remove ${d.name}`}>
                  <Ionicons name="close" size={18} color={DARK.muted} />
                </Pressable>
              </View>
            ))}
            <GradientButton title={status === 'REJECTED' ? 'Send for review again' : 'Send for review'} onPress={upload} loading={busy} disabled={!docs.length} />
          </>
        )}
        <Text style={s.muted}>Your licence is only seen by the Vendly team. It is never shown to customers.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, backgroundColor: DARK.card, borderWidth: 1, borderColor: 'rgba(217,166,221,0.2)' },
  noteText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  noteLink: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold, textDecorationLine: 'underline', marginTop: -6 },
  status: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  title: { fontSize: 20, fontFamily: FONTS.semibold },
  body: { color: '#E9DDEB', fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular, textAlign: 'center' },
  muted: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular, textAlign: 'center' },
  drop: { alignItems: 'center', gap: 6, paddingVertical: 24, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: DARK.border },
  dropTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 14, padding: 10 },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: DARK.field },
  pdf: { alignItems: 'center', justifyContent: 'center' },
  docName: { flex: 1, color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
});
