import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addDays, addMonths, format, getDay, isAfter, isBefore, isSameDay, isSameMonth, parseISO, startOfDay, startOfMonth } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import type { VendorDashboardStackParams } from '../../navigation/types';
import { SEVENTH } from '../../utils/grid';

// source 'calendar' = busy time imported from the vendor's own calendar (managed in Calendar sync)
interface Block { id: string; start_date: string; end_date: string; reason?: string | null; source?: 'manual' | 'calendar' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Block out dates a package can't be booked. Tap a start day, then an end day. */
export default function Availability() {
  const nav = useNavigation<NativeStackNavigationProp<VendorDashboardStackParams>>();
  const { listingId, title } = useRoute<RouteProp<VendorDashboardStackParams, 'Availability'>>().params;
  const insets = useSafeAreaInsets();
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(startOfMonth(today));
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/marketplace/listings/${listingId}/availability`);
      setBlocks(res.data?.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, [listingId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const days = useMemo(() => {
    const first = addDays(month, -getDay(month));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);
  const blocked = (d: Date) => blocks.some((b) => !isBefore(d, startOfDay(parseISO(b.start_date))) && !isAfter(d, startOfDay(parseISO(b.end_date))));
  const inRange = (d: Date) => !!range.start && ((range.end && !isBefore(d, range.start) && !isAfter(d, range.end)) || isSameDay(d, range.start));

  const pick = (d: Date) => {
    if (!range.start || range.end) return setRange({ start: d, end: null });
    if (isBefore(d, range.start)) return setRange({ start: d, end: range.start });
    setRange({ start: range.start, end: d });
  };

  const save = async () => {
    if (!range.start) return;
    setSaving(true);
    try {
      await api.post(`/vendor/listings/${listingId}/availability`, {
        start_date: format(range.start, 'yyyy-MM-dd'),
        end_date: format(range.end ?? range.start, 'yyyy-MM-dd'),
        reason: reason.trim() || undefined,
      });
      setRange({ start: null, end: null });
      setReason('');
      load();
    } catch (err: any) {
      Alert.alert('Could not block those dates', err?.response?.data?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (b: Block) =>
    Alert.alert('Open these dates again?', `${format(parseISO(b.start_date), 'dd MMM')} – ${format(parseISO(b.end_date), 'dd MMM')} will become bookable.`, [
      { text: 'Keep blocked', style: 'cancel' },
      {
        text: 'Open dates',
        onPress: async () => {
          try {
            await api.delete(`/vendor/listings/availability/${b.id}`);
            setBlocks((prev) => prev.filter((x) => x.id !== b.id));
          } catch (err: any) {
            Alert.alert('Could not remove', err?.response?.data?.message ?? 'Try again in a moment.');
          }
        },
      },
    ]);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Availability" onBack={() => nav.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <Text style={s.lead} numberOfLines={2}>{title}</Text>
          <View style={s.note}>
            <Ionicons name="information-circle-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Tap a start day and an end day to block them. Customers can't request those dates.</Text>
          </View>
          <Pressable style={s.note} onPress={() => (nav as any).navigate('ProfileTab', { screen: 'CalendarSync' })} accessibilityRole="button">
            <Ionicons name="calendar-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Busy in Google or Apple Calendar? Connect it in Calendar sync to block those days automatically.</Text>
            <Ionicons name="chevron-forward" size={16} color={DARK.muted} />
          </Pressable>

          <View style={s.monthRow}>
            <Pressable onPress={() => setMonth(addMonths(month, -1))} disabled={isSameMonth(month, today)} style={[s.monthBtn, isSameMonth(month, today) && { opacity: 0.3 }]} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            <Text style={s.monthTitle}>{format(month, 'MMMM yyyy')}</Text>
            <Pressable onPress={() => setMonth(addMonths(month, 1))} style={s.monthBtn} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </Pressable>
          </View>
          <View style={s.weekRow}>{WEEKDAYS.map((d) => <Text key={d} style={s.weekday}>{d}</Text>)}</View>
          <View style={s.grid}>
            {days.map((d) => {
              const off = !isSameMonth(d, month) || isBefore(d, today);
              const isBlocked = !off && blocked(d);
              const on = !off && inRange(d);
              const label = <Text style={[s.day, off && { color: DARK.field }, isBlocked && { color: '#F7B1B8' }, on && { color: '#fff' }]}>{format(d, 'd')}</Text>;
              return (
                <Pressable key={d.toISOString()} disabled={off} onPress={() => pick(d)} style={s.cell} accessibilityRole="button" accessibilityLabel={format(d, 'EEEE d MMMM') + (isBlocked ? ', blocked' : '')}>
                  {on ? <BrandGradient style={s.circle}>{label}</BrandGradient> : <View style={[s.circle, !off && !isBlocked && { backgroundColor: '#2A1536' }]}>{label}</View>}
                </Pressable>
              );
            })}
          </View>

          {range.start && (
            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>
                Block {format(range.start, 'dd MMM')}{range.end && !isSameDay(range.end, range.start) ? ` – ${format(range.end, 'dd MMM')}` : ''}
              </Text>
              <View style={ui.field}>
                <TextInput style={ui.input} placeholder="Reason (optional, e.g. Holiday)" placeholderTextColor={DARK.muted} value={reason} onChangeText={setReason} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable style={s.outline} onPress={() => setRange({ start: null, end: null })} accessibilityRole="button"><Text style={s.outlineText}>Clear</Text></Pressable>
                <GradientButton title="Block dates" onPress={save} loading={saving} style={{ flex: 1.5 }} />
              </View>
            </Card>
          )}

          <View style={{ gap: 10 }}>
            <Text style={s.h2}>Blocked dates</Text>
            {loading ? (
              <ActivityIndicator color={DARK.accent} />
            ) : blocks.length === 0 ? (
              <Text style={s.muted}>None yet. Every day is open for requests.</Text>
            ) : (
              blocks.map((b) => (
                <View key={b.id} style={s.block}>
                  <Ionicons name="close-circle-outline" size={20} color="#F7B1B8" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.blockText}>{format(parseISO(b.start_date), 'EEE, dd MMM')} – {format(parseISO(b.end_date), 'EEE, dd MMM yyyy')}</Text>
                    {b.source === 'calendar' ? <Text style={s.muted}>Busy in your calendar</Text> : !!b.reason && <Text style={s.muted}>{b.reason}</Text>}
                  </View>
                  {b.source !== 'calendar' && <Pressable onPress={() => remove(b)} hitSlop={8} accessibilityLabel="Open these dates"><Text style={s.link}>Open</Text></Pressable>}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  lead: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: DARK.card },
  noteText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK.border },
  monthTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: SEVENTH, alignItems: 'center' },
  circle: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.card },
  day: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.medium },
  h2: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
  block: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: DARK.card },
  blockText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
});
