import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Chip, GradientButton, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventToolsService, type BudgetSummary, type VendorTeam } from '../../services/eventTools.service';
import { apiError } from '../../services/contracts.service';

/** $1,200 for whole dollars, $1,207.50 otherwise */
const money = (n: number | null | undefined) => {
  if (n == null) return '—';
  const cents = Number(n) % 1 !== 0;
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
};

/** Budget from real bookings: committed (accepted), paid (charged) and what's left. */
export function BookingsBudget({ eventId, refreshKey }: { eventId: string; refreshKey?: unknown }) {
  const [b, setB] = useState<BudgetSummary | null>(null);
  useEffect(() => {
    EventToolsService.budget(eventId).then((r) => setB(r.data?.data ?? null)).catch(() => setB(null));
  }, [eventId, refreshKey]);
  if (!b) return <ActivityIndicator color={DARK.accent} style={{ marginVertical: 12 }} />;
  const pct = b.total_budget ? Math.min(100, (b.committed / b.total_budget) * 100) : 0;
  const booked = b.lines.filter((l) => l.booking);
  return (
    <View style={s.card}>
      <Text style={s.h2}>Budget</Text>
      <View style={s.stats}>
        <Stat label="Budget" value={money(b.total_budget)} />
        <Stat label="Committed" value={money(b.committed)} />
        <Stat label="Paid" value={money(b.spent)} />
      </View>
      {b.total_budget != null && (
        <>
          <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }, b.over_budget && { backgroundColor: '#FF8A8A' }]} /></View>
          <Text style={[s.muted, b.over_budget && { color: '#FF8A8A' }]}>{b.over_budget ? `${money(-(b.remaining ?? 0))} over budget` : `${money(b.remaining)} left to commit`}</Text>
        </>
      )}
      {booked.length > 0 && (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Text style={s.muted}>From bookings</Text>
          {booked.map((l) => (
            <View key={l.id} style={s.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.lineTitle} numberOfLines={1}>{l.booking!.vendor_name}</Text>
                <Text style={s.muted} numberOfLines={1}>{l.category} · {l.booking!.title}</Text>
              </View>
              <Text style={s.lineAmt}>{money(l.spent)} / {money(l.committed)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

/** Share the event read-only with the planner's client. */
export function ClientShareCard({ eventId, email, seesBudget, onChanged }: { eventId: string; email?: string | null; seesBudget?: boolean; onChanged: () => void }) {
  const [value, setValue] = useState(email ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (body: { email?: string | null; sees_budget?: boolean }) => {
    setBusy(true);
    try {
      await EventToolsService.setClient(eventId, body);
      onChanged();
      if (body.email) Alert.alert('Shared', `We emailed ${body.email} a link. They see the vendors, run of show and files.`);
    } catch (e) {
      Alert.alert('Could not share', apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.card}>
      <View style={s.head}><Ionicons name="eye-outline" size={20} color={DARK.accent} /><Text style={s.h2}>Share with your client</Text></View>
      <Text style={s.muted}>Your client follows along read-only: vendors, run of show and shared files. They sign in with this email.</Text>
      <View style={ui.field}>
        <Ionicons name="mail-outline" size={18} color={DARK.muted} />
        <TextInput style={ui.input} placeholder="client@email.com" placeholderTextColor={DARK.muted} autoCapitalize="none" keyboardType="email-address" value={value} onChangeText={setValue} accessibilityLabel="Client email" />
      </View>
      <View style={s.switchRow}>
        <Text style={[s.muted, { flex: 1 }]}>Show prices and budget to the client</Text>
        <Switch value={!!seesBudget} onValueChange={(v) => save({ sees_budget: v })} trackColor={{ true: DARK.border, false: DARK.field }} thumbColor="#fff" accessibilityLabel="Show prices to client" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {!!email && (
          <Pressable style={s.ghost} onPress={() => { setValue(''); save({ email: null }); }} accessibilityRole="button"><Text style={s.ghostText}>Stop sharing</Text></Pressable>
        )}
        <GradientButton title={email && value.trim().toLowerCase() === email ? 'Shared ✓' : 'Share'} onPress={() => value.trim() && save({ email: value.trim() })} loading={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Saved vendor teams: save the booked vendors as a team, and invite a whole team to this event. */
export function TeamsCard({
  eventId,
  bookedVendors,
  readOnly = false,
}: {
  eventId: string;
  bookedVendors: { id: string; name: string }[];
  /** a cancelled event: teams can be managed, but nobody can be invited to it */
  readOnly?: boolean;
}) {
  const nav = useNavigation<any>();
  const [teams, setTeams] = useState<VendorTeam[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    EventToolsService.teams().then((r) => setTeams(r.data?.data ?? [])).catch(() => setTeams([]));
  }, []);
  // again on coming back from the team editor
  useFocusEffect(load);

  const saveBooked = () => {
    if (!bookedVendors.length) return;
    const save = async (name: string) => {
      try {
        await EventToolsService.saveTeam({ name, vendor_ids: bookedVendors.map((v) => v.id) });
        load();
      } catch (e) {
        Alert.alert('Could not save', apiError(e));
      }
    };
    // iOS can ask for a name; Android has no text prompt, so it gets a dated default name
    if (Platform.OS === 'ios') {
      Alert.prompt('Name this team', bookedVendors.map((v) => v.name).join(', '), (name) => name?.trim() && save(name.trim()));
    } else {
      save(`Team ${new Date().toLocaleDateString()}`);
    }
  };

  const invite = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await EventToolsService.inviteTeam(eventId, selected, note.trim() || undefined);
      Alert.alert('Invites sent', `${r.data.data.invited} vendor${r.data.data.invited === 1 ? '' : 's'} got a message about this event. Their replies and quotes show up in Messages.`);
      setNote('');
      setSelected(null);
    } catch (e) {
      Alert.alert('Could not invite', apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedTeam = teams?.find((t) => t.id === selected);
  return (
    <View style={s.card}>
      <View style={s.head}><Ionicons name="people-outline" size={20} color={DARK.accent} /><Text style={s.h2}>Vendor teams</Text></View>
      {!teams ? (
        <ActivityIndicator color={DARK.accent} />
      ) : teams.length === 0 ? (
        <Text style={s.muted}>Save the vendors you love working with (booked before or not), then invite them all to your next event in one go.</Text>
      ) : (
        <>
          <View style={s.chips}>{teams.map((t) => <Chip key={t.id} label={`${t.name} (${t.vendors.length})`} active={selected === t.id} onPress={() => setSelected(selected === t.id ? null : t.id)} />)}</View>
          {!!selectedTeam && (
            <Pressable onPress={() => nav.navigate('TeamEditor', { team: selectedTeam })} hitSlop={8} accessibilityRole="button">
              <Text style={s.link}>Edit {selectedTeam.name}</Text>
            </Pressable>
          )}
          {selected && readOnly && <Text style={s.muted}>This event was cancelled, so you can&apos;t invite a team to it.</Text>}
          {selected && !readOnly && (
            <>
              <Text style={s.muted}>{selectedTeam?.vendors.map((v) => v.name).join(', ')}</Text>
              <View style={ui.field}><TextInput style={ui.input} placeholder="Add a note (optional)" placeholderTextColor={DARK.muted} value={note} onChangeText={setNote} /></View>
              <GradientButton title="Invite this team" onPress={invite} loading={busy} />
            </>
          )}
        </>
      )}
      <Pressable style={s.ghost} onPress={() => nav.navigate('TeamEditor')} accessibilityRole="button">
        <Text style={s.ghostText}>New team</Text>
      </Pressable>
      {bookedVendors.length > 1 && (
        <Pressable style={s.ghost} onPress={saveBooked} accessibilityRole="button">
          <Text style={s.ghostText}>Save these {bookedVendors.length} vendors as a team</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: DARK.field, borderRadius: 12, padding: 10, gap: 2 },
  statValue: { color: '#fff', fontSize: 15, fontFamily: FONTS.bold },
  bar: { height: 8, borderRadius: 4, backgroundColor: DARK.field, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: DARK.accent },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineTitle: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  lineAmt: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ghost: { height: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
});
