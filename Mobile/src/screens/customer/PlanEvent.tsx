import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Field, GradientButton, ScreenHeader, ui } from '../../components/brand';
import MonthCalendar from '../../components/MonthCalendar';
import LocationPicker, { type PickedPlace } from '../../components/LocationPicker';
import { PlanResultsList } from '../../components/planning/PlanItems';
import { DARK, FONTS } from '../../constants/colors';
import { dayKey } from '../../services/rentals.service';
import { apiError } from '../../services/contracts.service';
import { PLAN_EVENT_TYPES, PlanningService, money, searchParamsFor, type ChecklistRequest, type Plan } from '../../services/planning.service';
import type { CustomerHomeStackParams } from '../../navigation/types';

/** "Plan your event": the services an event like this usually books, a budget split, when to book and who is free. */
export default function PlanEvent({ navigation }: NativeStackScreenProps<CustomerHomeStackParams, 'PlanEvent'>) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [type, setType] = useState<string>('WEDDING');
  const [date, setDate] = useState<string | undefined>();
  const [calendar, setCalendar] = useState(false);
  const [guests, setGuests] = useState('');
  const [budget, setBudget] = useState('');
  const [place, setPlace] = useState<PickedPlace>({ label: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  // scroll to the results once they are laid out after a search
  const scrollToResults = useRef(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    const body: ChecklistRequest = { event_type: type };
    if (date) body.date = date;
    const g = Number(guests.replace(/[^0-9]/g, ''));
    if (g > 0) body.guest_count = g;
    const b = Number(budget.replace(/[^0-9.]/g, ''));
    if (b > 0) body.budget = b;
    if (place.label.trim()) {
      body.location = place.label.trim();
      if (place.lat != null && place.lng != null) {
        body.lat = place.lat;
        body.lng = place.lng;
      }
    }
    try {
      const res = await PlanningService.checklist(body);
      if (res.data?.success) {
        scrollToResults.current = true;
        setPlan(res.data.data);
      } else setError('We couldn’t build your checklist. Try again.');
    } catch (e) {
      setError(apiError(e, 'We couldn’t build your checklist. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = PLAN_EVENT_TYPES.find((t) => t.value === (plan?.event_type ?? type))?.label.toLowerCase() ?? 'event';

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <ScreenHeader title="Plan your event" onBack={() => navigation.goBack()} />
        <Text style={[s.intro, { paddingHorizontal: 20 }]}>
          We’ll list the services events like yours usually book, how to split the budget, when to book, and who on Vendly is free.
        </Text>

        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <View style={{ gap: 8 }}>
            <Text style={ui.label} accessibilityRole="header">Event type</Text>
            <View style={s.chips}>
              {PLAN_EVENT_TYPES.map((t) => (
                <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => setType(t.value)} />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Date (optional)</Text>
            <Pressable
              style={[ui.field, { minHeight: 44 }]}
              onPress={() => setCalendar(!calendar)}
              accessibilityRole="button"
              accessibilityLabel={date ? `Date, ${format(parseISO(date), 'EEEE d MMMM yyyy')}. Change` : 'Choose a date'}
            >
              <Ionicons name="calendar-outline" size={20} color={DARK.muted} />
              <Text style={[ui.input, !date && { color: DARK.muted }]}>{date ? format(parseISO(date), 'EEE d MMM yyyy') : 'Not set'}</Text>
              {date ? (
                <Pressable onPress={() => setDate(undefined)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear date">
                  <Ionicons name="close-circle" size={20} color={DARK.muted} />
                </Pressable>
              ) : (
                <Ionicons name={calendar ? 'chevron-up' : 'chevron-down'} size={18} color={DARK.muted} />
              )}
            </Pressable>
            {calendar && (
              <View style={s.calendar}>
                <MonthCalendar value={date ? parseISO(date) : null} onChange={(d) => { setDate(dayKey(d)); setCalendar(false); }} />
              </View>
            )}
          </View>

          <Field
            label="Guests (optional)"
            accessibilityLabel="Guests"
            placeholder="e.g. 120"
            keyboardType="number-pad"
            value={guests}
            onChangeText={setGuests}
            returnKeyType="done"
          />
          <Field
            label="Total budget in $ (optional)"
            accessibilityLabel="Total budget in dollars"
            placeholder="e.g. 25000"
            keyboardType="decimal-pad"
            value={budget}
            onChangeText={setBudget}
            returnKeyType="done"
          />
          <View style={{ gap: 8 }}>
            <Text style={ui.label}>Where (optional)</Text>
            <LocationPicker value={place} onChange={setPlace} label="Where" />
          </View>

          {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
          <GradientButton title={plan ? 'Update my checklist' : 'Get my checklist'} onPress={submit} loading={loading} />
        </View>

        {plan && (
          <View style={{ paddingHorizontal: 20, gap: 16 }} onLayout={(e) => {
              if (!scrollToResults.current) return;
              scrollToResults.current = false;
              scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true });
            }}>
            <View style={{ gap: 4 }}>
              <Text style={s.heading} accessibilityRole="header">
                {`${plan.items.length} ${plan.items.length === 1 ? 'service' : 'services'} for your ${typeLabel}`}
              </Text>
              {plan.totals.suggested_budget != null && <Text style={s.intro}>{`Budget split: ${money(plan.totals.suggested_budget)} in total`}</Text>}
            </View>
            <PlanResultsList plan={plan} onFind={(item) => navigation.navigate('SearchResults', searchParamsFor(item))} />
            <Text style={s.note}>
              {`Suggestions are typical for this kind of event, not a quote. Vendor counts are packages on Vendly${plan.date ? ' not blocked that day' : ''}${plan.near ? ` within about ${plan.radius_miles} miles (or that travel to you)` : ''}.`}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  intro: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  calendar: { backgroundColor: DARK.card, borderRadius: 16, padding: 14 },
  error: { color: '#FCA5A5', fontSize: 14, fontFamily: FONTS.medium },
  heading: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold },
  note: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
});
