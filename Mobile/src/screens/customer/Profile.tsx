import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants/colors';
import { api, TOKEN_KEY, USER_KEY } from '../../services/api';
import { BookingService } from '../../services/booking.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<any>;

interface UserProfile {
  id: string;
  name: string;
  email: string;
  type: string;
  avatar_url?: string;
}

export default function CustomerProfile() {
  const nav = useNavigation<Nav>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [bookingCount, setBookingCount] = useState<number | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<{ uri: string; type: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [profileRes, bookingsRes] = await Promise.all([
        api.get('/auth/me'),
        BookingService.getMyBookingsAsCustomer(),
      ]);
      if (profileRes.data?.success) {
        const user = profileRes.data.data;
        setProfile(user);
        setEditName(user.name ?? '');
        setAvatarUri(user.avatar_url ?? null);
      }
      if (bookingsRes.data?.success) {
        setBookingCount(bookingsRes.data.data?.length ?? 0);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

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
      setAvatarFile({ uri: asset.uri, type: asset.mimeType ?? 'image/jpeg', name: asset.fileName ?? `avatar_${Date.now()}.jpg` });
    }
  };

  const handleSave = async () => {
    if (!editName.trim()) { Alert.alert('Error', 'Name cannot be empty'); return; }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (avatarFile) {
        const fd = new FormData();
        fd.append('name', editName.trim());
        fd.append('image', { uri: avatarFile.uri, type: avatarFile.type, name: avatarFile.name } as any);
        await api.patch('/auth/update', fd, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
        });
      } else {
        await api.patch('/auth/update', { name: editName.trim() });
      }
      setAvatarFile(null);
      setEditMode(false);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(TOKEN_KEY);
          await AsyncStorage.removeItem(USER_KEY);
          nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const initials = profile?.name
    ? profile.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <View style={s.avatarSection}>
        <TouchableOpacity style={s.avatarWrap} onPress={editMode ? pickAvatar : undefined}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatarImg} />
          ) : (
            <View style={s.avatar}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          )}
          {editMode && (
            <View style={s.cameraOverlay}>
              <Ionicons name="camera" size={16} color={COLORS.white} />
            </View>
          )}
        </TouchableOpacity>

        {editMode ? (
          <>
            <Text style={s.tapHint}>Tap photo to change</Text>
            <View style={s.editRow}>
              <TextInput
                style={s.nameInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor={COLORS.gray[400]}
                autoFocus
              />
            </View>
          </>
        ) : (
          <Text style={s.profileName}>{profile?.name ?? '—'}</Text>
        )}

        <Text style={s.profileEmail}>{profile?.email ?? '—'}</Text>
        {profile?.type && (
          <View style={s.typeBadge}><Text style={s.typeText}>{profile.type}</Text></View>
        )}

        {editMode ? (
          <View style={s.editActions}>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelEditBtn} onPress={() => { setEditMode(false); setAvatarFile(null); load(); }}>
              <Text style={s.cancelEditText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.editBtn} onPress={() => setEditMode(true)}>
            <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
            <Text style={s.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{bookingCount != null ? String(bookingCount) : '—'}</Text>
          <Text style={s.statLabel}>Bookings</Text>
        </View>
      </View>

      <View style={s.menuSection}>
        <TouchableOpacity style={s.menuItem} onPress={() => nav.navigate('CustomerBookings')}>
          <Ionicons name="receipt-outline" size={20} color={COLORS.primary} />
          <Text style={s.menuItemText}>My Bookings</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.gray[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={s.menuItem} onPress={() => nav.navigate('ChatList')}>
          <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
          <Text style={s.menuItemText}>Messages</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.gray[400]} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, backgroundColor: COLORS.white, gap: 8 },
  avatarWrap: { marginBottom: 4, position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  tapHint: { fontSize: 12, color: COLORS.gray[400] },
  profileName: { fontSize: 20, fontWeight: '800', color: COLORS.gray[900] },
  profileEmail: { fontSize: 14, color: COLORS.gray[500] },
  typeBadge: { backgroundColor: COLORS.primaryBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  typeText: { fontSize: 12, fontWeight: '600', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  editRow: { width: '100%' },
  nameInput: { borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontWeight: '600', color: COLORS.gray[900], textAlign: 'center' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, minWidth: 120, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  cancelEditBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.gray[200], alignItems: 'center' },
  cancelEditText: { fontSize: 14, fontWeight: '600', color: COLORS.gray[600] },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primaryLight, paddingVertical: 8, paddingHorizontal: 16, marginTop: 4 },
  editBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.white, marginTop: 12, paddingVertical: 20, paddingHorizontal: 24, gap: 24 },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.gray[900] },
  statLabel: { fontSize: 12, color: COLORS.gray[500], marginTop: 2 },
  menuSection: { backgroundColor: COLORS.white, marginTop: 12, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.gray[50] },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.gray[800] },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
});
