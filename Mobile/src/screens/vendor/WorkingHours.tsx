import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { AuthService } from '../../services/auth.service';
import { apiMessage } from '../auth/SignIn';
import { DAY_KEYS, DAY_NAMES, DEFAULT_WEEK, formatTime, hoursProblem, minutesOf, summariseHours, type DayKey, type WorkingHours as Week } from '../../utils/workingHours';

const STEP = 30;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** − 9am + : moves a time by half an hour within its limits. */
function TimeStepper({ label, value, min, max, onChange }: { label: string; value: string; min: number; max: number; onChange: (v: string) => void }) {
  const m = minutesOf(value);
  const canDown = m - STEP >= min;
  const canUp = m + STEP <= max;
  return (
    <View style={s.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: formatTime(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canUp) onChange(hhmm(m + STEP));
        if (e.nativeEvent.actionName === 'decrement' && canDown) onChange(hhmm(m - STEP));
      }}
    >
      <Text style={s.stepLabel}>{label.split(' ').pop()}</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => canDown && onChange(hhmm(m - STEP))} disabled={!canDown} hitSlop={6} style={[s.stepBtn, !canDown && { opacity: 0.35 }]} accessibilityLabel={`${label} earlier`}>
          <Ionicons name="remove" size={18} color="#fff" />
        </Pressable>
        <Text style={s.stepValue}>{formatTime(value)}</Text>
        <Pressable onPress={() => canUp && onChange(hhmm(m + STEP))} disabled={!canUp} hitSlop={6} style={[s.stepBtn, !canUp && { opacity: 0.35 }]} accessibilityLabel={`${label} later`}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Weekly working hours. Customers can only request bookings that start on an open day and fit in
 * that day's hours; with none set, any day and time can be requested.
 */
export default function WorkingHours() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Week | null>(null);
  const [week, setWeek] = useState<Week>(DEFAULT_WEEK);
  const [lastTimes, setLastTimes] = useState<Partial<Record<DayKey, { open: string; close: string }>>>({});
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AuthService.me()
        .then((r) => {
          const hours = ((r.data?.data as any)?.working_hours ?? null) as Week | null;
          setSaved(hours);
          setWeek(hours ?? DEFAULT_WEEK);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, []),
  );

  const toggle = (day: DayKey, open: boolean) => {
    const current = week[day];
    if (!open && current) setLastTimes((t) => ({ ...t, [day]: current }));
    setWeek((w) => ({ ...w, [day]: open ? lastTimes[day] ?? { open: '09:00', close: '17:00' } : null }));
  };
  const setTime = (day: DayKey, which: 'open' | 'close', value: string) =>
    setWeek((w) => (w[day] ? { ...w, [day]: { ...w[day]!, [which]: value } } : w));

  const save = async (hours: Week | null) => {
    if (hours) {
      const problem = hoursProblem(hours);
      if (problem) return Alert.alert('Working hours', problem);
    }
    setBusy(true);
    try {
      const res = await AuthService.updateWorkingHours(hours);
      if (!res.data?.success) throw new Error(res.data?.message || 'Could not save your working hours.');
      setSaved(hours);
      if (!hours) setWeek(DEFAULT_WEEK);
      Alert.alert(hours ? 'Working hours saved' : 'Working hours removed', hours ? `Customers can book: ${summariseHours(hours)}.` : 'Customers can request any day and time.');
    } catch (err) {
      Alert.alert('Working hours', apiMessage(err, (err as Error)?.message || 'Could not save your working hours.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Remove working hours?', 'Customers will be able to request any day and time.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => save(null) },
    ]);

  const changed = JSON.stringify(saved) !== JSON.stringify(week);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
        <ScreenHeader title="Working hours" onBack={() => nav.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <View style={s.note}>
            <Ionicons name="time-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Customers can only request bookings on your open days, inside these hours (in the event's local time).</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={DARK.accent} />
          ) : (
            <>
              <Text style={s.muted} accessibilityLiveRegion="polite">
                {saved ? `Now: ${summariseHours(saved)}` : 'Not set: customers can request any day and time.'}
              </Text>
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {DAY_KEYS.map((day, i) => {
                  const h = week[day];
                  return (
                    <View key={day} style={[s.day, i > 0 && s.dayBorder]}>
                      <View style={s.dayHead}>
                        <Text style={s.dayName}>{DAY_NAMES[day]}</Text>
                        <Text style={s.closed}>{h ? '' : 'Closed'}</Text>
                        <Switch
                          value={!!h}
                          onValueChange={(v) => toggle(day, v)}
                          trackColor={{ true: DARK.accent, false: DARK.field }}
                          accessibilityLabel={`Open on ${DAY_NAMES[day]}`}
                        />
                      </View>
                      {h && (
                        <View style={s.times}>
                          <TimeStepper
                            label={`${DAY_NAMES[day]} opens`}
                            value={h.open}
                            min={0}
                            max={minutesOf(h.close) - STEP}
                            onChange={(v) => setTime(day, 'open', v)}
                          />
                          <TimeStepper
                            label={`${DAY_NAMES[day]} closes`}
                            value={h.close}
                            min={minutesOf(h.open) + STEP}
                            max={24 * 60}
                            onChange={(v) => setTime(day, 'close', v)}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
              <GradientButton title="Save working hours" onPress={() => save(week)} loading={busy} disabled={busy || (!changed && !!saved)} />
              {saved && (
                <Pressable style={s.outline} onPress={remove} disabled={busy} accessibilityRole="button">
                  <Text style={s.outlineText}>Remove hours</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: DARK.card },
  noteText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  day: { paddingVertical: 12, gap: 10 },
  dayBorder: { borderTopWidth: 1, borderTopColor: DARK.field },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayName: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  closed: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  times: { flexDirection: 'row', gap: 12 },
  stepper: { flex: 1, gap: 6 },
  stepLabel: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium, textTransform: 'capitalize' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: DARK.field, padding: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card },
  stepValue: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  outline: { height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
