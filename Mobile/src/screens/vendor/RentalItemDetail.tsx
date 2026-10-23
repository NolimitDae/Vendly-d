import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { RentalsService, type RentalItem, type RentalReservation } from '../../services/rentals.service';
import { apiError } from '../../services/contracts.service';
import type { VendorDashboardStackParams } from '../../navigation/types';
import { SEVENTH, SEVENTH_PCT } from '../../utils/grid';

type Detail = RentalItem & { reservations: RentalReservation[] };

const day = (iso: string) => format(parseISO(iso.slice(0, 10)), 'EEE d MMM');

/** One rental item: 60-day stock heatmap, upcoming rentals and quick actions. */
export default function RentalItemDetail({ navigation, route }: NativeStackScreenProps<VendorDashboardStackParams, 'RentalItemDetail'>) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    RentalsService.mineOne(route.params.itemId)
      .then((r) => setItem(r.data?.data ?? null))
      .catch((e) => Alert.alert('Rental item', apiError(e)));
  }, [route.params.itemId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!item) return <ActivityIndicator color={DARK.accent} style={s.loading} />;

  const live = item.status === 'ACTIVE';
  const toggle = async () => {
    try {
      await RentalsService.setStatus(item.id, live ? 'PAUSED' : 'ACTIVE');
      load();
    } catch (e) {
      Alert.alert('Could not update', apiError(e));
    }
  };
  const remove = () =>
    Alert.alert('Delete this item?', 'Customers will no longer see it. Past rentals stay in your bookings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await RentalsService.remove(item.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not delete', apiError(e));
          }
        },
      },
    ]);

  const upcoming = item.reservations.filter((r) => r.status === 'ACTIVE');
  const past = item.reservations.filter((r) => r.status !== 'ACTIVE');
  const sel = selected ? item.calendar?.find((c) => c.date === selected) : null;
  const onSelected = selected ? upcoming.filter((r) => r.start_date.slice(0, 10) <= selected && r.end_date.slice(0, 10) >= selected) : [];

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
      <ScreenHeader
        title={item.title}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => navigation.navigate('RentalItemForm', { itemId: item.id })} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Edit item">
            <Ionicons name="create-outline" size={20} color="#fff" />
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <Card style={s.top}>
          <View style={s.thumb}>{item.images[0] ? <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="cube-outline" size={28} color={DARK.muted} />}</View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.h2}>${item.daily_rate.toFixed(2)}/day</Text>
            <Text style={s.muted}>{item.quantity} in stock · {item.deposit_amount > 0 ? `$${item.deposit_amount.toFixed(0)} deposit` : 'no deposit'}</Text>
            <Text style={s.muted}>Turnaround {item.turnaround_hours ? `${item.turnaround_hours}h` : 'none'}</Text>
          </View>
        </Card>

        <View style={s.actions}>
          <Pressable style={s.action} onPress={toggle} accessibilityRole="button">
            <Ionicons name={live ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={DARK.accent} />
            <Text style={s.actionText}>{live ? 'Pause' : 'Make live'}</Text>
          </Pressable>
          <Pressable style={s.action} onPress={remove} accessibilityRole="button">
            <Ionicons name="trash-outline" size={20} color="#FF8A8A" />
            <Text style={[s.actionText, { color: '#FF8A8A' }]}>Delete</Text>
          </Pressable>
        </View>

        <Card style={{ gap: 12 }}>
          <Text style={s.h2}>Stock, next 60 days</Text>
          <View style={s.heat}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <Text key={`w${i}`} style={s.weekday}>{w}</Text>)}
            {/* line the first day up under its weekday */}
            {Array.from({ length: item.calendar?.length ? parseISO(item.calendar[0].date).getDay() : 0 }, (_, i) => <View key={`pad${i}`} style={[s.cell, { backgroundColor: 'transparent' }]} />)}
            {(item.calendar ?? []).map((c) => {
              const ratio = item.quantity ? c.available / item.quantity : 0;
              const bg = ratio >= 1 ? DARK.field : ratio > 0 ? '#7A2A82' : '#C0486B';
              const isSel = selected === c.date;
              return (
                <Pressable key={c.date} onPress={() => setSelected(isSel ? null : c.date)} style={[s.cell, { backgroundColor: bg }, isSel && s.cellSel]} accessibilityLabel={`${day(c.date)}: ${c.available} of ${item.quantity} free`}>
                  <Text style={s.cellText}>{parseISO(c.date).getDate() === 1 ? format(parseISO(c.date), 'MMM') : parseISO(c.date).getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={s.legend}>
            <Legend color={DARK.field} label="All free" />
            <Legend color="#7A2A82" label="Some out" />
            <Legend color="#C0486B" label="Fully booked" />
          </View>
          {sel && (
            <View style={s.selBox}>
              <Text style={s.body}>{day(sel.date)}: {sel.available} of {item.quantity} free</Text>
              {onSelected.map((r) => <Text key={r.id} style={s.muted}>· {r.quantity} with {r.booking.customer?.name ?? 'a customer'}</Text>)}
            </View>
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={s.h2}>Upcoming rentals</Text>
          {upcoming.length === 0 && <Text style={s.muted}>No upcoming rentals for this item.</Text>}
          {upcoming.map((r) => <ResRow key={r.id} r={r} onPress={() => (navigation as any).navigate('BookingsTab', { screen: 'VendorBookingDetail', params: { bookingId: r.booking.id } })} />)}
          {past.length > 0 && (
            <>
              <Text style={[s.muted, { marginTop: 4 }]}>Returned</Text>
              {past.slice(0, 5).map((r) => <ResRow key={r.id} r={r} onPress={() => (navigation as any).navigate('BookingsTab', { screen: 'VendorBookingDetail', params: { bookingId: r.booking.id } })} />)}
            </>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function ResRow({ r, onPress }: { r: RentalReservation; onPress: () => void }) {
  return (
    <Pressable style={s.res} onPress={onPress} accessibilityRole="button">
      <View style={s.resQty}>
        <Text style={s.resQtyText}>×{r.quantity}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{r.booking.customer?.name ?? 'Customer'}</Text>
        <Text style={s.muted}>{day(r.start_date)} → {day(r.end_date)} · {r.booking.status.toLowerCase().replace('_', ' ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
    </Pressable>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  loading: { flex: 1, backgroundColor: DARK.bg },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  h2: { color: '#fff', fontSize: 17, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  heat: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 5 },
  weekday: { width: SEVENTH, textAlign: 'center', color: DARK.muted, fontSize: 11, fontFamily: FONTS.medium, marginBottom: 2 },
  cell: { width: `${SEVENTH_PCT - 1.5}%`, marginHorizontal: '0.75%', aspectRatio: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cellSel: { borderWidth: 2, borderColor: '#fff' },
  cellText: { color: '#fff', fontSize: 11, fontFamily: FONTS.medium },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  selBox: { backgroundColor: DARK.field, borderRadius: 12, padding: 12, gap: 4 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resQty: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  resQtyText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.bold },
});
