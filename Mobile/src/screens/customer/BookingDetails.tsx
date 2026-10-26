import React, { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addHours, format, parseISO, set } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import LocationPicker from '../../components/LocationPicker';
import { DARK, FONTS } from '../../constants/colors';
import type { CustomerHomeStackParams } from '../../navigation/types';
import { haptic } from '../../utils/haptics';
import { MarketplaceService } from '../../services/marketplace.service';
import { countedUnit, estimate, money, plural, rangeText, type AddOn } from '../../services/addons.service';
import { tooSoonMessage } from '../../utils/packageDetails';
import CustomizationPicker from '../../components/booking/CustomizationPicker';
import { choicesPayload, missingChoice, upchargeEstimate, type Customization, type Picks } from '../../utils/packageOptions';
import { dayKeyOf, fitsHours, hoursMessage, minutesOf, otherZone, startTimesOn, type WorkingHours } from '../../utils/workingHours';

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
  // the package's limits and add-ons come from the listing itself (the summary passed in doesn't carry them)
  const [pkg, setPkg] = useState<{ price_unit?: string; min_quantity?: number | null; max_quantity?: number | null; add_ons: AddOn[]; customizations: Customization[]; working_hours?: WorkingHours | null; needs_service_address?: boolean; needs_guest_count?: boolean } | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  // the package's customizations: what was picked for each
  const [choices, setChoices] = useState<Picks>({});

  useEffect(() => {
    MarketplaceService.getListing(listing.id)
      .then((r) => {
        const l = r.data?.data;
        if (l) setPkg({ price_unit: l.price_unit, min_quantity: l.min_quantity, max_quantity: l.max_quantity, add_ons: l.add_ons ?? [], customizations: l.customizations ?? [], working_hours: l.working_hours ?? null, needs_service_address: l.needs_service_address, needs_guest_count: l.needs_guest_count });
      })
      .catch(() => {});
  }, [listing.id]);

  // a vendor quote replaces the package price, so its guest/hour limits don't apply
  const unit = listing.quoteId ? null : countedUnit(pkg?.price_unit ?? listing.priceUnit);
  const min = pkg?.min_quantity && pkg.min_quantity > 0 ? pkg.min_quantity : null;
  const max = pkg?.max_quantity && pkg.max_quantity > 0 ? pkg.max_quantity : null;
  const packageDurations = unit === 'hour' && max ? DURATIONS.filter((d) => d.hours <= max) : DURATIONS;
  // the vendor's hours that day (undefined = no hours set, null = closed): start times and lengths stay inside them
  const hours = pkg?.working_hours ?? null;
  const dayHours = hours ? hours[dayKeyOf(date)] : undefined;
  const shortest = Math.min(...packageDurations.map((d) => d.hours)) * 60;
  const times = hours
    ? (startTimesOn(hours, date, 30, shortest) ?? []).map((t) => ({ hours: Number(t.slice(0, 2)), minutes: Number(t.slice(3, 5)) }))
    : TIMES;
  const fromMinutes = start ? start.hours * 60 + start.minutes : dayHours ? minutesOf(dayHours.open) : 0;
  // hours in another zone than this phone's are checked moment by moment in the vendor's zone
  const zoned = !!otherZone(hours);
  const startText = start ? `${String(start.hours).padStart(2, '0')}:${String(start.minutes).padStart(2, '0')}` : null;
  const durations =
    hours && zoned
      ? startText
        ? packageDurations.filter((d) => fitsHours(hours, date, startText, d.hours * 60))
        : packageDurations
      : dayHours
        ? packageDurations.filter((d) => fromMinutes + d.hours * 60 <= minutesOf(dayHours.close))
        : packageDurations;
  // nothing on this day fits the vendor's hours
  const closedDay = hours ? (zoned ? times.length === 0 : dayHours === null) : false;
  const addOns = pkg?.add_ons ?? [];
  const picked = addOns.filter((a) => picks[a.id] != null).map((a) => ({ addOn: a, quantity: picks[a.id] }));
  // venues and packages at the vendor's place happen there: no address to give
  const asksAddress = (pkg?.needs_service_address ?? listing.needsServiceAddress) !== false;
  // a venue needs the guest count (for an event, the event's own count is used when none is typed)
  const venueGuests = !!(pkg?.needs_guest_count ?? listing.needsGuestCount) && !listing.eventId;
  const needsGuests = venueGuests || unit === 'person' || picked.some((p) => p.addOn.price_unit === 'PER_PERSON');
  const guestCount = guests ? Number(guests) : undefined;

  // keep the chosen duration valid for an hourly package's maximum
  useEffect(() => {
    if (durations.length && !durations.some((d) => d.label === duration.label)) setDuration(durations[durations.length - 1]);
  }, [durations, duration.label]);
  // a start picked before the hours loaded that falls outside them is cleared
  useEffect(() => {
    if (start && hours && !times.some((t) => t.hours === start.hours && t.minutes === start.minutes)) setStart(null);
  }, [hours, times, start]);

  const togglePick = (a: AddOn) => {
    haptic.select();
    setPicks((prev) => {
      const next = { ...prev };
      if (next[a.id] != null) delete next[a.id];
      else next[a.id] = 1;
      return next;
    });
  };
  const step = (a: AddOn, by: number) => {
    haptic.select();
    const cap = a.max_quantity ?? 1000;
    setPicks((prev) => ({ ...prev, [a.id]: Math.min(cap, Math.max(1, (prev[a.id] ?? 1) + by)) }));
  };

  // per unit upcharges count what the package counts: guests, hours (at least the minimum) or days
  const optionUnit = countedUnit(pkg?.price_unit ?? listing.priceUnit);
  const optionUnits = optionUnit === 'person' ? guestCount ?? 0 : optionUnit === 'hour' ? Math.max(duration.hours, min ?? 0) : optionUnit === 'day' ? Math.max(1, min ?? 0) : 1;
  const upcharges = upchargeEstimate(pkg?.customizations, choices, optionUnits);

  const startAt = start ? set(day, { ...start, seconds: 0, milliseconds: 0 }) : null;
  const endAt = startAt ? addHours(startAt, duration.hours) : null;

  const proceed = () => {
    if (!startAt || !endAt) return Alert.alert('Start time', 'Choose when the service should start.');
    const tooSoon = tooSoonMessage(listing.minNoticeHours, startAt);
    if (tooSoon) return Alert.alert('Too soon', tooSoon);
    if (hours && (closedDay || !durations.some((d) => d.label === duration.label))) {
      return Alert.alert('Working hours', `${hoursMessage(hours, dayKeyOf(date))} Pick a time and length inside those hours.`);
    }
    if (asksAddress && !venue.trim()) return Alert.alert('Service address', 'Tell the vendor where the service happens.');
    if (needsGuests && !(guestCount && guestCount >= 1)) {
      return Alert.alert(
        'Guest count',
        venueGuests
          ? 'Enter how many guests are coming. The venue needs a guest count to take the booking.'
          : unit === 'person'
            ? 'This package is priced per person. Enter how many guests are coming.'
            : 'Some add-ons you picked are priced per person. Enter how many guests are coming.',
      );
    }
    if (unit === 'person' && guestCount && min && guestCount < min) return Alert.alert('Guest count', `This package is for at least ${plural(min, 'guest')}.`);
    if (unit === 'person' && guestCount && max && guestCount > max) return Alert.alert('Guest count', `This package is for up to ${plural(max, 'guest')}. Message the vendor about a bigger event.`);
    const unanswered = missingChoice(pkg?.customizations, choices);
    if (unanswered) return Alert.alert('Customizations', unanswered);
    const options = choicesPayload(pkg?.customizations, choices);
    navigation.navigate('BookingSummary', {
      listing,
      draft: {
        date,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        durationLabel: duration.label,
        venue: asksAddress ? venue.trim() : '',
        guests: guests ? Number(guests) : undefined,
        notes: notes.trim() || undefined,
        addOns: picked.length ? picked.map(({ addOn, quantity }) => (addOn.price_unit === 'PER_ITEM' ? { add_on_id: addOn.id, quantity } : { add_on_id: addOn.id })) : undefined,
        options: options.length ? options : undefined,
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
            {hours && !closedDay && dayHours && <Text style={s.hint}>{hoursMessage(hours, dayKeyOf(date))}</Text>}
            {hours && closedDay && <Text style={s.hint}>{hoursMessage(hours, dayKeyOf(date))} Go back and pick another day.</Text>}
            <FlatList
              key={hours ? 'hours' : 'any'}
              horizontal
              data={times}
              keyExtractor={(t) => `${t.hours}:${t.minutes}`}
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
              initialScrollIndex={hours ? undefined : 6}
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
              {durations.map((d) => (
                <Chip key={d.label} label={d.label} active={d.label === duration.label} onPress={() => setDuration(d)} />
              ))}
            </View>
            {endAt && (
              <Text style={s.hint}>
                {format(startAt!, 'h:mm a')} – {format(endAt, 'h:mm a')}
              </Text>
            )}
            {unit === 'hour' && (
              <Text style={s.hint}>Priced per hour{rangeText('hour', min, max) ? ` · ${rangeText('hour', min, max)}` : ''}{min ? '. Shorter bookings pay the minimum.' : ''}</Text>
            )}
          </View>

          {asksAddress ? (
            <View style={{ gap: 8 }}>
              <Text style={ui.label}>Service Address</Text>
              <LocationPicker value={{ label: venue }} onChange={(p) => setVenue(p.label)} label="Service address" placeholder="Where should the vendor come?" street />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={ui.label}>Where</Text>
              <Text style={s.hint}>{`This happens at ${listing.vendorName}'s place, so there's no address to add. You'll see the full address once they accept.`}</Text>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Field
              label={needsGuests ? 'Guest Count (required)' : 'Guest Count'}
              placeholder={unit === 'person' && rangeText('person', min, max) ? rangeText('person', min, max)! : needsGuests ? 'e.g. 120' : 'e.g. 120 (optional)'}
              value={guests}
              onChangeText={(t) => setGuests(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              accessibilityLabel={needsGuests ? 'Guest count, required' : 'Guest count, optional'}
            />
            {unit === 'person' && <Text style={s.hint}>Priced per person{rangeText('person', min, max) ? ` · ${rangeText('person', min, max)}` : ''}</Text>}
          </View>

          <CustomizationPicker groups={pkg?.customizations ?? []} value={choices} onChange={setChoices} />

          {addOns.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={ui.label}>Add-ons</Text>
              <Text style={s.hint}>Optional extras from {listing.vendorName}.</Text>
              {addOns.map((a) => {
                const on = picks[a.id] != null;
                const q = picks[a.id] ?? 1;
                return (
                  <View key={a.id} style={[s.addOn, on && s.addOnOn]}>
                    <Pressable
                      style={s.addOnMain}
                      onPress={() => togglePick(a)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${a.name}, ${a.price_text}`}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? DARK.accent : DARK.muted} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.addOnName}>{a.name}</Text>
                        <Text style={s.addOnPrice}>{a.price_text}</Text>
                        {!!a.description && <Text style={s.hint}>{a.description}</Text>}
                      </View>
                    </Pressable>
                    {on && a.price_unit === 'PER_ITEM' && (
                      <View style={s.stepper}>
                        <Pressable onPress={() => step(a, -1)} disabled={q <= 1} style={[s.stepBtn, q <= 1 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={`Fewer ${a.name}`}>
                          <Ionicons name="remove" size={20} color="#fff" />
                        </Pressable>
                        <Text style={s.stepValue} accessibilityLabel={`${q} selected`}>{q}</Text>
                        <Pressable
                          onPress={() => step(a, 1)}
                          disabled={!!a.max_quantity && q >= a.max_quantity}
                          style={[s.stepBtn, !!a.max_quantity && q >= a.max_quantity && { opacity: 0.4 }]}
                          accessibilityRole="button"
                          accessibilityLabel={`More ${a.name}`}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {(unit || picked.length > 0 || upcharges > 0) && startAt && (!needsGuests || !!guestCount) && (
            <Text style={s.estimate}>
              About {money(estimate({ price: listing.price, price_unit: pkg?.price_unit ?? listing.priceUnit, min_quantity: min, quote: !!listing.quoteId }, { guests: guestCount, hours: duration.hours }, picked) + upcharges)} before the Vendly Protection fee. You’ll see the exact price next.
            </Text>
          )}

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
  addOn: { borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: 'transparent' },
  addOnOn: { borderColor: DARK.border },
  addOnMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 44 },
  addOnName: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  addOnPrice: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 12, paddingHorizontal: 14, paddingBottom: 12 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold, minWidth: 28, textAlign: 'center' },
  estimate: { color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
