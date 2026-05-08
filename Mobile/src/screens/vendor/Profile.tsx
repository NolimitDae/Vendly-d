import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  type: string;
  avatar_url?: string;
  vendorProfile?: { business_name?: string; bio?: string };
}

export default function VendorProfile() {
  const navigation = useNavigation<any>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<{ uri: string; type: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.success) {
        const u = res.data.data;
        setUser(u);
        setName(u.name ?? '');
        setBusinessName(u.vendorProfile?.business_name ?? '');
        setAvatarUri(u.avatar_url ?? null);
      }
    } catch {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAvatarUri(asset.uri);
      setAvatarFile({
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? `avatar_${Date.now()}.jpg`,
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (avatarFile) {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('business_name', businessName);
        fd.append('image', { uri: avatarFile.uri, type: avatarFile.type, name: avatarFile.name } as any);
        await api.patch('/auth/update', fd, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
        });
      } else {
        await api.patch('/auth/update', { name, business_name: businessName });
      }
      setEditing(false);
      setAvatarFile(null);
      load();
    } catch {
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['token', 'user']);
          navigation.reset({ index: 0, routes: [{ name: 'Auth' as never }] });
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const initials = (user?.name ?? 'V').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.header}>
        <TouchableOpacity style={s.avatarWrap} onPress={editing ? pickAvatar : undefined}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatarImg} />
          ) : (
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
          )}
          {editing && (
            <View style={s.cameraOverlay}>
              <Ionicons name="camera" size={18} color={COLORS.white} />
            </View>
          )}
        </TouchableOpacity>

        {!editing ? (
          <>
            <Text style={s.name}>{user?.name}</Text>
            {user?.vendorProfile?.business_name ? (
              <Text style={s.business}>{user.vendorProfile.business_name}</Text>
            ) : null}
            <Text style={s.email}>{user?.email}</Text>
            <View style={s.badge}><Text style={s.badgeText}>Vendor</Text></View>
          </>
        ) : (
          <Text style={s.tapHint}>Tap photo to change</Text>
        )}
      </View>

      <View style={s.card}>
        {editing ? (
          <>
            <Text style={s.label}>Full Name</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={COLORS.gray[400]} />
            <Text style={s.label}>Business Name</Text>
            <TextInput style={s.input} value={businessName} onChangeText={setBusinessName} placeholder="Your business name" placeholderTextColor={COLORS.gray[400]} />
            <View style={s.row}>
              <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.gray[200], flex: 1, marginRight: 8 }]} onPress={() => { setEditing(false); setAvatarFile(null); load(); }}>
                <Text style={[s.btnText, { color: COLORS.gray[700] }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={s.btnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity style={s.btn} onPress={() => setEditing(true)}>
            <Ionicons name="pencil-outline" size={16} color={COLORS.white} style={{ marginRight: 6 }} />
            <Text style={s.btnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={s.logout} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingVertical: 32, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100] },
  avatarWrap: { marginBottom: 12, position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: COLORS.white, fontSize: 28, fontWeight: '700' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  tapHint: { fontSize: 12, color: COLORS.gray[400], marginBottom: 4 },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.gray[900] },
  business: { fontSize: 15, color: COLORS.gray[500], marginTop: 2 },
  email: { fontSize: 14, color: COLORS.gray[400], marginTop: 4 },
  badge: { marginTop: 8, backgroundColor: COLORS.primaryBg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  card: { margin: 16, backgroundColor: COLORS.white, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600], marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: COLORS.gray[900] },
  row: { flexDirection: 'row', marginTop: 16 },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, padding: 16, gap: 8 },
  logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});
