import { haptic } from '../../utils/haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { addDays, addMonths, format, getDay, isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth, parseISO } from 'date-fns';
import { BrandGradient, Card, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { MarketplaceService } from '../../services/marketplace.service';
import type { CustomerHomeStackParams } from '../../navigation/types';
import { isOpenDay, summariseHours, withZone, type WorkingHours } from '../../utils/workingHours';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOOKED = '#F7B1B8';

export default function SelectDate({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'SelectDate'>) {
  const { listing } = route.params;
  const insets = useSafeAreaInsets();
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(startOfMonth(today));
  const [selected, setSelected] = useState<Date | null>(null);
  const [blocked, setBlocked] = useState<{ start: Date; end: Date; reason?: string | null }[]>([]);
  // the vendor's weekly hours: closed weekdays are greyed out (null = any day)
  const [hours, setHours] = useState<WorkingHours | null>(null);

  useEffect(() => {
    MarketplaceService.getBlockedDates(listing.id)
      .then((r) => {
        setBlocked((r.data?.data ?? []).map((b) => ({ start: startOfDay(parseISO(b.start_date)), end: startOfDay(parseISO(b.end_date)), reason: b.reason })));
        setHours(r.data?.working_hours ?? null);
      })
      .catch(() => {});
  }, [listing.id]);

  const isBlocked = (d: Date) => blocked.some((b) => !isBefore(d, b.start) && !isBefore(b.end, d));

  // Six rows of seven, starting on the Sunday before the 1st, so the grid never jumps height.
  const days = useMemo(() => {
    const first = addDays(month, -getDay(month));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);

  const blockedThisMonth = blocked.filter((b) => isSameMonth(b.start, month) || isSameMonth(b.end, month)).length;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110, gap: 20 }}>
        <ScreenHeader title="Select Date" onBack={() => navigation.goBack()} />

        <View style={s.note}>
          <Ionicons name="information-circle-outline" size={16} color={DARK.accent} />
          <Text style={s.noteText}>
            {hours ? `${listing.vendorName} works ${withZone(summariseHours(hours) ?? '', hours)}. ` : ''}
            {blockedThisMonth > 0
              ? `${listing.vendorName} has ${blockedThisMonth} unavailable period${blockedThisMonth === 1 ? '' : 's'} this month`
              : hours
                ? 'Greyed-out days are closed.'
                : `${listing.vendorName} confirms each request, so pick the date that works for you`}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <View style={s.monthRow}>
            <Pressable
              onPress={() => setMonth(addMonths(month, -1))}
              disabled={isSameMonth(month, today)}
              style={[s.monthBtn, isSameMonth(month, today) && { opacity: 0.3 }]}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            <Text style={s.monthTitle}>{format(month, 'MMMM yyyy')}</Text>
            <Pressable onPress={() => setMonth(addMonths(month, 1))} style={s.monthBtn} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </Pressable>
          </View>

          <View style={s.weekRow}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={s.weekday}>{d}</Text>
            ))}
          </View>

          <View style={s.grid}>
            {/* rows of seven equal cells: percentage widths round past 100% on some iPhones and push Saturday off */}
            {Array.from({ length: 6 }, (_, row) => (
              <View key={row} style={s.gridRow}>
            {days.slice(row * 7, row * 7 + 7).map((d) => {
              const inMonth = isSameMonth(d, month);
              const past = isBefore(d, today);
              const booked = inMonth && !past && isBlocked(d);
              const on = !!selected && isSameDay(d, selected);
              // a weekday the vendor doesn't work
              const closed = inMonth && !past && !booked && !isOpenDay(hours, d);
              const off = !inMonth || past || closed;
              const label = <Text style={[s.day, off && s.dayOff, booked && { color: BOOKED }, on && { color: '#fff' }]}>{format(d, 'd')}</Text>;
              return (
                <Pressable
                  key={d.toISOString()}
                  disabled={off || booked}
                  onPress={() => {
                    haptic.select();
                    setSelected(d);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: off || booked }}
                  accessibilityLabel={format(d, 'EEEE d MMMM') + (booked ? ', fully booked' : closed ? ', closed' : '')}
                  style={s.cell}
                >
                  {on ? <BrandGradient style={s.circle}>{label}</BrandGradient> : <View style={[s.circle, !off && !booked && s.circleOpen]}>{label}</View>}
                </Pressable>
              );
            })}
              </View>
            ))}
          </View>

          <View style={s.legend}>
            <BrandGradient style={s.legendDot} />
            <Text style={s.legendText}>Available</Text>
            <View style={[s.legendDot, { backgroundColor: BOOKED, marginLeft: 28 }]} />
            <Text style={s.legendText}>Fully Booked</Text>
            {hours && (
              <>
                <View style={[s.legendDot, { backgroundColor: DARK.card, marginLeft: 28 }]} />
                <Text style={s.legendText}>Closed</Text>
              </>
            )}
          </View>

          <Card style={s.summary}>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={s.summaryLabel}>
                <Ionicons name="calendar-outline" size={14} color="#fff" />
                <Text style={s.body}>Date</Text>
              </View>
              <Text style={s.summaryValue}>{selected ? format(selected, 'dd MMM yyyy') : 'Pick a day above'}</Text>
            </View>
            <View style={s.divider} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={s.summaryLabel}>
                <Ionicons name="storefront-outline" size={14} color="#fff" />
                <Text style={s.body}>Service</Text>
              </View>
              <Text style={s.summaryValue} numberOfLines={1}>{listing.title}</Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
        <GradientButton
          title="Continue"
          disabled={!selected}
          onPress={() => selected && navigation.navigate('BookingDetails', { listing, date: format(selected, 'yyyy-MM-dd') })}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, padding: 12, borderRadius: 12, backgroundColor: DARK.card },
  noteText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK.border },
  monthTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center' },
  circle: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card },
  circleOpen: { backgroundColor: '#2A1536' },
  day: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.medium },
  dayOff: { color: DARK.field },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, padding: 14 },
  summaryLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular },
  summaryValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  divider: { width: 1, height: 44, backgroundColor: DARK.field },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg },
});
