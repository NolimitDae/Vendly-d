import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Chip, Field, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { IdentityService, IdStatus } from '../../services/identity.service';

const DOCS = [
  { value: 'DRIVERS_LICENSE', label: 'Driver’s licence' },
  { value: 'STATE_ID', label: 'State ID' },
  { value: 'NATIONAL_ID', label: 'National ID' },
  { value: 'PASSPORT', label: 'Passport' },
];
type Slot = 'front' | 'back' | 'selfie';

const part = (a: ImagePicker.ImagePickerAsset, name: string) =>
  ({ uri: a.uri, name: a.fileName ?? `${name}.jpg`, type: a.mimeType ?? 'image/jpeg' }) as unknown as Blob;

/** Photo ID + selfie for an admin to check; needed once before switching roles. */
export default function VerifyIdentity() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<IdStatus | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [doc, setDoc] = useState('DRIVERS_LICENSE');
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<Partial<Record<Slot, ImagePicker.ImagePickerAsset>>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    IdentityService.status()
      .then((res) => {
        setStatus(res.data?.data?.status ?? 'NONE');
        setReason(res.data?.data?.rejection_reason ?? null);
      })
      .catch(() => setStatus('NONE'));
  }, []);

  const needsBack = doc !== 'PASSPORT';

  const shoot = async (slot: Slot) => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      // ID photos may come from the library; the selfie should be live
      if (slot === 'selfie') return Alert.alert('Camera', 'Allow camera access to take your selfie.');
      return library(slot);
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      cameraType: slot === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (!res.canceled && res.assets[0]) setPhotos((p) => ({ ...p, [slot]: res.assets[0] }));
  };

  const library = async (slot: Slot) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) setPhotos((p) => ({ ...p, [slot]: res.assets[0] }));
  };

  const choose = (slot: Slot) =>
    slot === 'selfie'
      ? shoot(slot)
      : Alert.alert('Add photo', undefined, [
          { text: 'Take photo', onPress: () => shoot(slot) },
          { text: 'Choose from library', onPress: () => library(slot) },
          { text: 'Cancel', style: 'cancel' },
        ]);

  const ready = name.trim().length >= 2 && photos.front && photos.selfie && (!needsBack || photos.back);

  const send = async () => {
    if (!ready) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('document_type', doc);
      form.append('legal_name', name.trim());
      form.append('front', part(photos.front!, 'id-front'));
      if (needsBack && photos.back) form.append('back', part(photos.back, 'id-back'));
      form.append('selfie', part(photos.selfie!, 'selfie'));
      const res = await IdentityService.submit(form);
      Alert.alert('Sent for review', res.data?.message ?? 'We’ll notify you when your ID is checked.');
      nav.goBack();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      Alert.alert('Couldn’t upload', (Array.isArray(m) ? m[0] : m) || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Verify your ID" onBack={() => nav.goBack()} />
      {status === null ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : status === 'APPROVED' || status === 'PENDING' ? (
        <View style={s.done}>
          <Ionicons name={status === 'APPROVED' ? 'checkmark-circle' : 'time-outline'} size={56} color={status === 'APPROVED' ? '#4ADE80' : '#F5B700'} />
          <Text style={s.doneTitle}>{status === 'APPROVED' ? 'Your ID is verified' : 'We’re reviewing your ID'}</Text>
          <Text style={s.doneBody}>
            {status === 'APPROVED' ? 'You can switch roles now.' : 'Usually within one business day. We’ll notify you when it’s done.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Text style={s.lead}>We check once that you are who you say you are, before you can switch between customer, vendor and planner.</Text>
          {status === 'REJECTED' && (
            <Text style={s.error}>We couldn’t verify your last upload{reason ? `: ${reason}` : '.'} Please try again.</Text>
          )}

          <View style={{ gap: 8 }}>
            <Text style={s.label}>Document</Text>
            <View style={s.chips}>
              {DOCS.map((d) => <Chip key={d.value} label={d.label} active={doc === d.value} onPress={() => setDoc(d.value)} />)}
            </View>
          </View>

          <Field label="Full legal name" value={name} onChangeText={setName} placeholder="As it appears on your ID" autoComplete="name" maxLength={255} />

          <View style={s.grid}>
            <PhotoSlot label="Front of ID" hint="All corners in view, no glare" asset={photos.front} onPress={() => choose('front')} />
            {needsBack && <PhotoSlot label="Back of ID" hint="The side with the barcode" asset={photos.back} onPress={() => choose('back')} />}
            <PhotoSlot label="Selfie" hint="Face clearly lit, no hat or sunglasses" asset={photos.selfie} onPress={() => choose('selfie')} selfie />
          </View>

          <View style={s.privacy}>
            <Ionicons name="lock-closed-outline" size={16} color={DARK.muted} />
            <Text style={s.privacyText}>Stored privately, seen only by Vendly’s review team, and deleted if you delete your account.</Text>
          </View>

          <GradientButton title="Send for review" onPress={send} loading={sending} disabled={!ready} />
        </ScrollView>
      )}
    </View>
  );
}

function PhotoSlot({ label, hint, asset, onPress, selfie }: { label: string; hint: string; asset?: ImagePicker.ImagePickerAsset; onPress: () => void; selfie?: boolean }) {
  return (
    <Pressable style={s.slot} onPress={onPress} accessibilityRole="button" accessibilityLabel={asset ? `Change ${label}` : `Add ${label}`}>
      {asset ? (
        <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <Ionicons name={selfie ? 'camera-outline' : 'id-card-outline'} size={28} color={DARK.muted} />
          <Text style={s.slotLabel}>{label}</Text>
          <Text style={s.slotHint}>{hint}</Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  lead: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  error: { color: '#F87171', fontSize: 14, lineHeight: 20, fontFamily: FONTS.medium },
  label: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slot: { width: '47%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderStyle: 'dashed', borderColor: DARK.border, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  slotLabel: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold, textAlign: 'center' },
  slotHint: { color: DARK.muted, fontSize: 11, lineHeight: 15, fontFamily: FONTS.regular, textAlign: 'center' },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  privacyText: { flex: 1, color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.regular },
  done: { alignItems: 'center', padding: 32, gap: 10 },
  doneTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold, textAlign: 'center' },
  doneBody: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular, textAlign: 'center' },
});
