import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, addMonths, format, getDay, isAfter, isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth } from 'date-fns';
import { BrandGradient } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { SEVENTH } from '../utils/grid';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Month picker in the Figma calendar style. Past days are disabled.
 * Single date: `value` + `onChange`. Range (rentals): pass `rangeEnd` too; the parent decides how
 * taps extend the range. `isDisabled` greys out sold-out days, `badge` puts a small count under a day.
 */
export default function MonthCalendar({
  value,
  onChange,
  rangeEnd,
  isDisabled,
  badge,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  rangeEnd?: Date | null;
  isDisabled?: (d: Date) => boolean;
  badge?: (d: Date) => string | undefined;
}) {
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
          const outside = !isSameMonth(d, month) || isBefore(d, today);
          const blocked = !outside && !!isDisabled?.(d);
          const off = outside || blocked;
          const edge = (!!value && isSameDay(d, value)) || (!!rangeEnd && isSameDay(d, rangeEnd));
          const inside = !!value && !!rangeEnd && isAfter(d, value) && isBefore(d, rangeEnd);
          const note = !outside ? badge?.(d) : undefined;
          const label = (
            <Text style={[s.day, off && { color: DARK.field }, blocked && s.struck, (edge || inside) && { color: '#fff' }]}>{format(d, 'd')}</Text>
          );
          return (
            <Pressable
              key={d.toISOString()}
              disabled={off}
              onPress={() => onChange(d)}
              style={s.cell}
              accessibilityRole="button"
              accessibilityState={{ selected: edge || inside, disabled: off }}
              accessibilityLabel={`${format(d, 'EEEE d MMMM')}${blocked ? ', unavailable' : ''}${note ? `, ${note}` : ''}`}
            >
              {inside && <View style={s.band} />}
              {/* half bands join the range ends to the days between */}
              {edge && !!rangeEnd && !!value && !isSameDay(value, rangeEnd) && <View style={[s.band, isSameDay(d, value) ? { left: '50%' } : { right: '50%' }]} />}
              {edge ? <BrandGradient style={s.circle}>{label}</BrandGradient> : <View style={[s.circle, !off && !inside && { backgroundColor: '#2A1536' }, inside && { backgroundColor: 'transparent' }]}>{label}</View>}
              {!!note && <Text style={s.badge}>{note}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK.border },
  monthTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  weekday: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: SEVENTH, alignItems: 'center' },
  circle: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 39, backgroundColor: '#5A2361' },
  day: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.medium },
  struck: { textDecorationLine: 'line-through' },
  badge: { color: DARK.muted, fontSize: 9, fontFamily: FONTS.medium, marginTop: 2 },
});
