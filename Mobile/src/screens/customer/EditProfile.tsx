import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { apiMessage } from '../auth/SignIn';
import { SOCIALS, type SocialKey } from '../../components/SocialLinks';

export default function EditProfile({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ first_name: '', last_name: '', address: '', business_name: '', about_me: '', handle: '' });
  const isVendor = user?.type === 'VENDOR';
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [banner, setBanner] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [logo, setLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  // social accounts as typed; the server turns handles into links and says when one isn't right
  const [socials, setSocials] = useState<Record<SocialKey, string>>(() => Object.fromEntries(SOCIALS.map(({ key }) => [key, ''])) as Record<SocialKey, string>);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    // /auth/me carries first/last name and address; fall back to splitting the display name.
    const u = user as any;
    const [first = '', ...rest] = (u?.name ?? '').split(' ');
    setForm({ first_name: u?.first_name ?? first, last_name: u?.last_name ?? rest.join(' '), address: u?.address ?? '', business_name: u?.business_name ?? '', about_me: u?.about_me ?? u?.bio ?? '', handle: u?.handle ?? '' });
    setSocials(Object.fromEntries(SOCIALS.map(({ key }) => [key, u?.socials?.[key] ?? ''])) as Record<SocialKey, string>);
  }, [user]);

  const pick = async (aspect: [number, number], done: (a: ImagePicker.ImagePickerAsset) => void) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7 });
    if (!res.canceled) done(res.assets[0]);
  };
  const file = (a: ImagePicker.ImagePickerAsset, name: string) => ({ uri: a.uri, name: a.fileName ?? `${name}.jpg`, type: a.mimeType ?? 'image/jpeg' }) as unknown as Blob;

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return Alert.alert('Name', 'First and last name are required.');
    setSaving(true);
    try {
      const body = new FormData();
      body.append('first_name', form.first_name.trim());
      body.append('last_name', form.last_name.trim());
      body.append('name', `${form.first_name.trim()} ${form.last_name.trim()}`);
      if (form.address.trim()) body.append('address', form.address.trim());
      if (isVendor) {
        body.append('business_name', form.business_name.trim());
        body.append('about_me', form.about_me.trim());
        body.append('handle', form.handle.trim());
        // always sent, so clearing a field removes that link
        SOCIALS.forEach(({ key }) => body.append(key, socials[key].trim()));
        if (banner) body.append('banner', file(banner, 'banner'));
        if (logo) body.append('logo', file(logo, 'logo'));
      }
      if (photo) body.append('image', file(photo, 'avatar'));
      const res = await api.patch('/auth/update', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success === false) throw new Error(res.data?.message);
      await refreshUser();
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  const avatar = photo?.uri ?? user?.avatar_url;
  const bannerUri = banner?.uri ?? (user as any)?.banner_url;
  const logoUri = logo?.uri ?? (user as any)?.logo_url;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />

        <Pressable onPress={() => pick([1, 1], setPhoto)} style={s.avatar} accessibilityRole="button" accessibilityLabel="Change profile photo">
          {avatar ? <Image source={{ uri: avatar }} style={s.avatarImg} /> : <Ionicons name="person-outline" size={54} color={DARK.muted} />}
          <BrandGradient style={s.badge}>
            <Ionicons name="image-outline" size={16} color="#fff" />
          </BrandGradient>
        </Pressable>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Field label="First Name" placeholder="Enter your first name" value={form.first_name} onChangeText={set('first_name')} autoComplete="given-name" />
          <Field label="Last Name" placeholder="Enter your last name" value={form.last_name} onChangeText={set('last_name')} autoComplete="family-name" />
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Email</Text>
            <View style={[ui.field, { opacity: 0.6 }]}>
              <Ionicons name="mail-outline" size={20} color={DARK.muted} />
              <Text style={ui.input}>{user?.email}</Text>
            </View>
            <Text style={s.hint}>Your email is used to sign in and can't be changed here.</Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Location</Text>
            <View style={ui.field}>
              <Ionicons name="location-outline" size={20} color={DARK.muted} />
              <TextInput style={ui.input} placeholder="City, State" placeholderTextColor={DARK.muted} value={form.address} onChangeText={set('address')} autoComplete="street-address" />
            </View>
          </View>
          {isVendor && (
            <>
              <Field label="Business Name" placeholder="What customers see on your profile" value={form.business_name} onChangeText={set('business_name')} autoComplete="organization" />
              <View style={{ gap: 8 }}>
                <Text style={ui.label}>About your business</Text>
                <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
                  <TextInput style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]} placeholder="Your style, experience, what makes you different…" placeholderTextColor={DARK.muted} value={form.about_me} onChangeText={set('about_me')} multiline maxLength={1000} />
                </View>
              </View>

              <Text style={[ui.label, { fontSize: 16, marginTop: 8 }]}>Your shop</Text>
              <View style={{ gap: 8 }}>
                <Text style={ui.label}>Banner</Text>
                <Pressable onPress={() => pick([3, 1], setBanner)} style={s.banner} accessibilityRole="button" accessibilityLabel="Change shop banner">
                  {bannerUri ? <Image source={{ uri: bannerUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={28} color={DARK.muted} />}
                  <BrandGradient style={[s.badge, { right: 8, bottom: 8, borderWidth: 0 }]}>
                    <Ionicons name="image-outline" size={16} color="#fff" />
                  </BrandGradient>
                </Pressable>
                <Text style={s.hint}>Shown across the top of your shop. A wide photo works best.</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable onPress={() => pick([1, 1], setLogo)} style={s.logo} accessibilityRole="button" accessibilityLabel="Change shop logo">
                  {logoUri ? <Image source={{ uri: logoUri }} style={StyleSheet.absoluteFill} /> : <Ionicons name="storefront-outline" size={28} color={DARK.muted} />}
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={ui.label}>Logo</Text>
                  <Text style={s.hint}>Tap to choose a square logo for your shop.</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Text style={ui.label}>Shop link</Text>
                <View style={ui.field}>
                  <Text style={s.prefix}>vendlymarketplace.com/v/</Text>
                  <TextInput
                    style={ui.input}
                    placeholder="your-shop"
                    placeholderTextColor={DARK.muted}
                    value={form.handle}
                    onChangeText={(v) => set('handle')(v.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    accessibilityLabel="Shop link"
                  />
                </View>
                <Text style={s.hint}>3–30 letters, numbers or dashes. Leave empty for no link.</Text>
              </View>

              <Text style={[ui.label, { fontSize: 16, marginTop: 8 }]}>Social accounts</Text>
              <Text style={[s.hint, { marginTop: -8 }]}>Add your @handle or paste a link. Customers can tap them on your profile.</Text>
              {SOCIALS.map(({ key, label, placeholder, icon }) => (
                <View key={key} style={{ gap: 8 }}>
                  <Text style={ui.label}>{label}</Text>
                  <View style={ui.field}>
                    <Ionicons name={icon} size={20} color={DARK.muted} />
                    <TextInput
                      style={ui.input}
                      placeholder={placeholder}
                      placeholderTextColor={DARK.muted}
                      value={socials[key]}
                      onChangeText={(v) => setSocials((cur) => ({ ...cur, [key]: v }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      maxLength={255}
                      accessibilityLabel={label}
                    />
                  </View>
                </View>
              ))}
            </>
          )}
          <GradientButton title="Save Changes" onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  avatar: { alignSelf: 'center', width: 118, height: 118, borderRadius: 59, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 118, height: 118, borderRadius: 59 },
  badge: { position: 'absolute', right: 2, bottom: 6, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: DARK.bg, alignItems: 'center', justifyContent: 'center' },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  banner: { height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 72, height: 72, borderRadius: 16, overflow: 'hidden', backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' },
  prefix: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
});
