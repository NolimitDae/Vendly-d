import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, addMonths, format, getDay, isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth } from 'date-fns';
import { BrandGradient } from './brand';
import { DARK, FONTS } from '../constants/colors';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Single-date month picker in the Figma calendar style. Past days are disabled. */
export default function MonthCalendar({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(startOfMonth(value ?? today));
  const days = useMemo(() => {
    const first = addDays(month, -getDay(month));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);

  return (
    <View style={{ gap: 16 }}>
      <View style={s.monthRow}>
        <Pressable onPress={() => setMonth(addMonths(month, -1))} disabled={isSameMonth(month, today)} style={[s.monthBtn, isSameMonth(month, today) && { opacity: 0.3 }]} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <Text style={s.monthTitle}>{format(month, 'MMMM yyyy')}</Text>
        <Pressable onPress={() => setMonth(addMonths(month, 1))} style={s.monthBtn} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>{WEEKDAYS.map((d) => <Text key={d} style={s.weekday}>{d}</Text>)}</View>
      <View style={s.grid}>
        {days.map((d) => {
          const off = !isSameMonth(d, month) || isBefore(d, today);
          const on = !!value && isSameDay(d, value);
          const label = <Text style={[s.day, off && { color: DARK.field }, on && { color: '#fff' }]}>{format(d, 'd')}</Text>;
          return (
            <Pressable key={d.toISOString()} disabled={off} onPress={() => onChange(d)} style={s.cell} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={format(d, 'EEEE d MMMM')}>
              {on ? <BrandGradient style={s.circle}>{label}</BrandGradient> : <View style={[s.circle, !off && { backgroundColor: '#2A1536' }]}>{label}</View>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK.border },
  monthTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  weekday: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  circle: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card },
  day: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.medium },
});
