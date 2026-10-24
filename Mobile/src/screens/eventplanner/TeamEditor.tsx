import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventToolsService, MAX_TEAM_SIZE, type TeamVendor } from '../../services/eventTools.service';
import { apiError } from '../../services/contracts.service';
import type { EventPlannerStackParams } from '../../navigation/types';

/** Create or edit a saved team: a name, its vendors, and a search to add any active vendor (booked before or not). */
export default function TeamEditor({ navigation, route }: NativeStackScreenProps<EventPlannerStackParams, 'TeamEditor'>) {
  const team = route.params?.team;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(team?.name ?? '');
  const [members, setMembers] = useState<TeamVendor[]>(team?.vendors ?? route.params?.initialVendors ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamVendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const term = query.trim();

  // search a moment after typing stops
  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      setSearching(true);
      EventToolsService.searchTeamVendors(term)
        .then((r) => live && setResults(r.data?.data ?? []))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);

  const inTeam = new Set(members.map((m) => m.id));
  const full = members.length >= MAX_TEAM_SIZE;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Team name', 'Give the team a name.');
    if (!members.length) return Alert.alert('No vendors yet', 'Add at least one vendor.');
    setSaving(true);
    try {
      await EventToolsService.saveTeam({ name: name.trim(), vendor_ids: members.map((m) => m.id) }, team?.id);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save the team', apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    team &&
    Alert.alert('Delete this team?', `“${team.name}” will be removed. The vendors aren't told.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          EventToolsService.deleteTeam(team.id)
            .then(() => navigation.goBack())
            .catch((e) => Alert.alert('Could not delete', apiError(e))),
      },
    ]);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={team ? 'Edit team' : 'New team'} onBack={() => navigation.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Field label="Team name" placeholder="My wedding team" value={name} onChangeText={setName} maxLength={120} />

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Vendors ({members.length}/{MAX_TEAM_SIZE})</Text>
            {members.length === 0 && <Text style={s.muted}>No vendors yet. Search below to add some.</Text>}
            {members.map((m) => (
              <VendorRow key={m.id} vendor={m}>
                <Pressable onPress={() => setMembers((list) => list.filter((x) => x.id !== m.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`}>
                  <Ionicons name="close-circle-outline" size={22} color={DARK.muted} />
                </Pressable>
              </VendorRow>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Search vendors</Text>
            <View style={ui.field}>
              <Ionicons name="search-outline" size={20} color={DARK.muted} />
              <TextInput
                style={ui.input}
                placeholder="Name or category, e.g. catering"
                placeholderTextColor={DARK.muted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search vendors"
              />
            </View>
            {searching && <ActivityIndicator color={DARK.accent} />}
            {!searching && term.length >= 2 && results.length === 0 && <Text style={s.muted}>No vendors match “{term}”.</Text>}
            {results.map((v) => (
              <VendorRow key={v.id} vendor={v}>
                {inTeam.has(v.id) ? (
                  <Text style={s.muted}>In team</Text>
                ) : (
                  <Pressable
                    onPress={() => setMembers((list) => [...list, v])}
                    disabled={full}
                    style={[s.add, full && { opacity: 0.4 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${v.name}`}
                  >
                    <Text style={s.addText}>Add</Text>
                  </Pressable>
                )}
              </VendorRow>
            ))}
            {full && <Text style={s.muted}>A team can have up to {MAX_TEAM_SIZE} vendors.</Text>}
          </View>

          <GradientButton title="Save team" onPress={save} loading={saving} />
          {team && (
            <Pressable onPress={remove} style={s.delete} accessibilityRole="button">
              <Text style={s.deleteText}>Delete team</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VendorRow({ vendor, children }: { vendor: TeamVendor; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      {vendor.avatar_url ? (
        <Image source={{ uri: vendor.avatar_url }} style={s.avatar} />
      ) : (
        <View style={s.avatar}><Text style={s.avatarText}>{vendor.name[0]?.toUpperCase()}</Text></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{vendor.name}</Text>
        {!!vendor.category && <Text style={s.muted} numberOfLines={1}>{vendor.category}</Text>}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: DARK.card },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  name: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  add: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  addText: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  delete: { height: 48, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fca5a5', fontSize: 15, fontFamily: FONTS.medium },
});
