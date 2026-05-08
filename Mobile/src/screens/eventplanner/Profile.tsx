import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import {
  EventPlannerService,
  EventPlannerProfile,
} from '../../services/eventplanner.service';
import { useAuth } from '../../contexts/AuthContext';

const EVENT_TYPES = [
  'WEDDING', 'BIRTHDAY', 'CORPORATE', 'CONCERT', 'CONFERENCE', 'PRIVATE_PARTY', 'OTHER',
] as const;

const ET_LABELS: Record<string, string> = {
  WEDDING: 'Wedding', BIRTHDAY: 'Birthday', CORPORATE: 'Corporate',
  CONCERT: 'Concert', CONFERENCE: 'Conference', PRIVATE_PARTY: 'Private Party', OTHER: 'Other',
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending Review', color: '#a16207', bg: '#fefce8' },
  APPROVED: { label: 'Approved', color: '#15803d', bg: '#f0fdf4' },
  SUSPENDED: { label: 'Suspended', color: '#ef4444', bg: '#fef2f2' },
  NOT_APPLICABLE: { label: 'N/A', color: COLORS.gray[500], bg: COLORS.gray[100] },
};

export default function EPProfile() {
  const { user, refreshUser, logout } = useAuth();
  const [profile, setProfile] = useState<EventPlannerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [businessName, setBusinessName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await EventPlannerService.getMyProfile();
      if (res.data?.success) {
        const p = res.data.data;
        setProfile(p);
        // Pre-fill edit form
        setBusinessName(p.business_name ?? '');
        setBio(p.bio ?? '');
        setWebsite(p.website ?? '');
        setInstagram(p.instagram ?? '');
        setYearsExp(p.years_experience ? String(p.years_experience) : '');
        setTeamSize(p.team_size ? String(p.team_size) : '');
        setSelectedTypes(p.event_types ?? []);
      }
    } catch {
      // Profile may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await EventPlannerService.upsertProfile({
        business_name: businessName || undefined,
        bio: bio || undefined,
        website: website || undefined,
        instagram: instagram || undefined,
        years_experience: yearsExp ? parseInt(yearsExp) : undefined,
        team_size: teamSize ? parseInt(teamSize) : undefined,
        event_types: selectedTypes,
      });
      if (res.data?.success || res.status === 201 || res.status === 200) {
        await load();
        setEditing(false);
        Alert.alert('Saved', 'Profile updated successfully');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const statusInfo = profile ? (STATUS_BADGE[profile.license_status] ?? STATUS_BADGE.NOT_APPLICABLE) : null;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* User header */}
      <View style={s.header}>
        <View style={s.avatarWrap}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={s.avatar} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarInitial}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </View>
        <Text style={s.headerName}>{user?.name}</Text>
        <Text style={s.headerEmail}>{user?.email}</Text>
        {statusInfo && (
          <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[s.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        )}
      </View>

      {/* Business info card */}
      {!editing ? (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Business Profile</Text>
            <TouchableOpacity onPress={() => setEditing(true)} style={s.editBtn}>
              <Ionicons name="pencil" size={14} color={COLORS.primary} />
              <Text style={s.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <InfoRow label="Business Name" value={profile?.business_name ?? '—'} />
          <InfoRow label="Website" value={profile?.website ?? '—'} />
          <InfoRow label="Instagram" value={profile?.instagram ? `@${profile.instagram}` : '—'} />
          <InfoRow label="Years Experience" value={profile?.years_experience ? `${profile.years_experience} years` : '—'} />
          <InfoRow label="Team Size" value={profile?.team_size ? `${profile.team_size} people` : '—'} />

          {profile?.bio ? (
            <View style={s.bioSection}>
              <Text style={s.infoLabel}>Bio</Text>
              <Text style={s.bioText}>{profile.bio}</Text>
            </View>
          ) : null}

          {/* Specializations */}
          {(profile?.event_types?.length ?? 0) > 0 && (
            <View style={s.typesSection}>
              <Text style={s.infoLabel}>Specializations</Text>
              <View style={s.typesWrap}>
                {profile!.event_types.map((et) => (
                  <View key={et} style={s.typeChip}>
                    <Text style={s.typeChipText}>{ET_LABELS[et] ?? et}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Portfolio */}
          {(profile?.portfolio?.length ?? 0) > 0 && (
            <View style={s.portfolioSection}>
              <Text style={s.infoLabel}>Portfolio ({profile!.portfolio.length} photos)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {profile!.portfolio.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={s.portfolioImg} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : (
        /* Edit form */
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={{ color: COLORS.gray[500], fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {[
            { label: 'Business Name', value: businessName, onChange: setBusinessName, placeholder: 'Your business name' },
            { label: 'Website', value: website, onChange: setWebsite, placeholder: 'https://...' },
            { label: 'Instagram handle', value: instagram, onChange: setInstagram, placeholder: 'yourbrand' },
            { label: 'Years of Experience', value: yearsExp, onChange: setYearsExp, placeholder: '5', keyboard: 'numeric' as const },
            { label: 'Team Size', value: teamSize, onChange: setTeamSize, placeholder: '3', keyboard: 'numeric' as const },
          ].map(({ label, value, onChange, placeholder, keyboard }) => (
            <View key={label} style={s.field}>
              <Text style={s.fieldLabel}>{label}</Text>
              <TextInput
                style={s.input}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                keyboardType={keyboard}
                autoCapitalize="none"
              />
            </View>
          ))}

          <View style={s.field}>
            <Text style={s.fieldLabel}>Bio</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell clients about yourself and your experience..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={s.field}>
            <Text style={s.fieldLabel}>Specializations</Text>
            <View style={s.typesGrid}>
              {EVENT_TYPES.map((et) => (
                <TouchableOpacity
                  key={et}
                  style={[s.typeToggle, selectedTypes.includes(et) && s.typeToggleActive]}
                  onPress={() => toggleType(et)}
                >
                  <Text style={[s.typeToggleText, selectedTypes.includes(et) && s.typeToggleTextActive]}>
                    {ET_LABELS[et]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={s.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Sign out */}
      <View style={s.section}>
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: logout },
          ])}
        >
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: COLORS.primary, alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 20 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  headerName: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  headerEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  statusBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  section: { margin: 16, backgroundColor: COLORS.white, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[900] },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.gray[50] },
  infoLabel: { fontSize: 13, color: COLORS.gray[500], fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.gray[800], flex: 1, textAlign: 'right', marginLeft: 16 },
  bioSection: { paddingVertical: 12 },
  bioText: { fontSize: 14, color: COLORS.gray[700], lineHeight: 20, marginTop: 6 },
  typesSection: { paddingVertical: 12 },
  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: { backgroundColor: COLORS.primaryBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  typeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  portfolioSection: { paddingVertical: 12 },
  portfolioImg: { width: 120, height: 90, borderRadius: 10, marginRight: 10 },
  // Edit form
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray[700], marginBottom: 6 },
  input: { backgroundColor: COLORS.gray[50], borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.gray[900] },
  textarea: { height: 100 },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeToggle: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.gray[200], backgroundColor: COLORS.gray[50] },
  typeToggleActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  typeToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  typeToggleTextActive: { color: COLORS.primary },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
});
