import React, { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addHours, format, parseISO, set } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import type { CustomerHomeStackParams } from '../../navigation/types';

// Half-hour start times from 7am to 9pm, shown as one-tap chips like Figma's time slots.
const TIMES = Array.from({ length: 29 }, (_, i) => ({ hours: 7 + Math.floor(i / 2), minutes: (i % 2) * 30 }));

const DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
  { label: '4 hours', hours: 4 },
  { label: 'Half day', hours: 6 },
  { label: 'Full day', hours: 10 },
];

export default function BookingDetails({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'BookingDetails'>) {
  const { listing, date } = route.params;
  const insets = useSafeAreaInsets();
  const day = parseISO(date);
  const [start, setStart] = useState<{ hours: number; minutes: number } | null>(null);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [venue, setVenue] = useState('');
  const [guests, setGuests] = useState('');
  const [notes, setNotes] = useState('');

  const startAt = start ? set(day, { ...start, seconds: 0, milliseconds: 0 }) : null;
  const endAt = startAt ? addHours(startAt, duration.hours) : null;

  const proceed = () => {
    if (!startAt || !endAt) return Alert.alert('Start time', 'Choose when the service should start.');
    if (!venue.trim()) return Alert.alert('Service address', 'Tell the vendor where the service happens.');
    navigation.navigate('BookingSummary', {
      listing,
      draft: {
        date,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        durationLabel: duration.label,
        venue: venue.trim(),
        guests: guests ? Number(guests) : undefined,
        notes: notes.trim() || undefined,
      },
    });
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <ScreenHeader title="Booking Details" onBack={() => navigation.goBack()} />

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Pressable style={s.datePill} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Change date">
            <Ionicons name="calendar-outline" size={22} color={DARK.accent} />
            <Text style={s.datePillText}>{format(day, 'dd MMM yyyy')}</Text>
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </Pressable>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Service Start Time</Text>
            <FlatList
              horizontal
              data={TIMES}
              keyExtractor={(t) => `${t.hours}:${t.minutes}`}
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
              initialScrollIndex={6}
              getItemLayout={(_, i) => ({ length: 96, offset: 96 * i, index: i })}
              renderItem={({ item }) => {
                const on = !!start && start.hours === item.hours && start.minutes === item.minutes;
                return <Chip label={format(set(day, item), 'h:mm a')} active={on} onPress={() => setStart(item)} />;
              }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Service Duration</Text>
            <View style={s.chips}>
              {DURATIONS.map((d) => (
                <Chip key={d.label} label={d.label} active={d.label === duration.label} onPress={() => setDuration(d)} />
              ))}
            </View>
            {endAt && (
              <Text style={s.hint}>
                {format(startAt!, 'h:mm a')} – {format(endAt, 'h:mm a')}
              </Text>
            )}
          </View>

          <Field label="Service Address" placeholder="Where should the vendor come?" value={venue} onChangeText={setVenue} autoComplete="street-address" />

          <Field label="Guest Count" placeholder="e.g. 120 (optional)" value={guests} onChangeText={(t) => setGuests(t.replace(/\D/g, ''))} keyboardType="number-pad" />

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Notes for the vendor</Text>
            <View style={[ui.field, s.textarea]}>
              <TextInput
                style={[ui.input, { height: 90, textAlignVertical: 'top' }]}
                placeholder="Allergies, special requests, access details (optional)"
                placeholderTextColor={DARK.muted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
            <Text style={s.hint}>These are written into the contract.</Text>
          </View>

          <GradientButton title="Proceed to Request Booking" onPress={proceed} style={{ marginTop: 12 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 99,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  datePillText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  textarea: { height: undefined, paddingVertical: 12, alignItems: 'flex-start' },
});
