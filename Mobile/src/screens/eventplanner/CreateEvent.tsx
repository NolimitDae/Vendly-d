import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import MonthCalendar from '../../components/MonthCalendar';
import { DARK, FONTS } from '../../constants/colors';
import { EventsService, type EventType } from '../../services/events.service';
import { apiMessage } from '../auth/SignIn';

const EVENT_TYPES: { label: string; value: EventType }[] = [
  { label: 'Wedding', value: 'WEDDING' },
  { label: 'Birthday', value: 'BIRTHDAY' },
  { label: 'Corporate', value: 'CORPORATE' },
  { label: 'Concert', value: 'CONCERT' },
  { label: 'Conference', value: 'CONFERENCE' },
  { label: 'Private party', value: 'PRIVATE_PARTY' },
  { label: 'Other', value: 'OTHER' },
];

export default function CreateEvent() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [type, setType] = useState<EventType>('WEDDING');
  const [date, setDate] = useState<Date | null>(null);
  const [venue, setVenue] = useState('');
  const [guests, setGuests] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Event name', 'Give the event a name your client will recognise.');
    setSaving(true);
    try {
      const res = await EventsService.create({
        name: name.trim(),
        type,
        date: date ? date.toISOString() : undefined,
        venue: venue.trim() || undefined,
        guest_count: guests ? Number(guests) : undefined,
        total_budget: budget ? Number(budget) : undefined,
        notes: notes.trim() || undefined,
      });
      if (res.data?.success === false) throw new Error((res.data as any)?.message);
      const created = res.data?.data;
      nav.replace('EventDetail', { eventId: created.id, eventName: created.name });
    } catch (err) {
      Alert.alert('Could not create event', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="New Event" onBack={() => nav.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <Text style={s.sectionTitle}>Event Details</Text>
          <Field label="Event Name" placeholder="e.g. Sarah & John's Wedding" value={name} onChangeText={setName} />
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Event Type</Text>
            <View style={s.chips}>{EVENT_TYPES.map((t) => <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => setType(t.value)} />)}</View>
          </View>
          <View style={{ gap: 12 }}>
            <Text style={ui.label}>Event Date{date ? ` · ${format(date, 'EEE, dd MMM yyyy')}` : ''}</Text>
            <MonthCalendar value={date} onChange={setDate} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Venue</Text>
            <View style={ui.field}>
              <Ionicons name="location-outline" size={20} color={DARK.muted} />
              <TextInput style={ui.input} placeholder="e.g. Grand Ballroom, NYC" placeholderTextColor={DARK.muted} value={venue} onChangeText={setVenue} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Guests" placeholder="150" value={guests} onChangeText={(t) => setGuests(t.replace(/\D/g, ''))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={ui.label}>Budget</Text>
              <View style={ui.field}>
                <Text style={s.currency}>$</Text>
                <TextInput style={ui.input} placeholder="10000" placeholderTextColor={DARK.muted} value={budget} onChangeText={(t) => setBudget(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
              </View>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Notes</Text>
            <View style={[ui.field, s.textarea]}>
              <TextInput style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]} placeholder="Theme, must-haves, anything the vendors should know" placeholderTextColor={DARK.muted} value={notes} onChangeText={setNotes} multiline />
            </View>
          </View>
          <GradientButton title="Create Event" onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  sectionTitle: { color: '#fff', fontSize: 22, fontFamily: FONTS.medium, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: DARK.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  textarea: { height: undefined, paddingVertical: 12, alignItems: 'flex-start' },
});
