import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, isBefore, isSameDay } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, GradientButton, ScreenHeader } from '../../components/brand';
import MonthCalendar from '../../components/MonthCalendar';
import { DARK, FONTS } from '../../constants/colors';
import { dayKey, RentalsService, type RentalItem as Item } from '../../services/rentals.service';
import { apiError } from '../../services/contracts.service';
import type { CustomerHomeStackParams } from '../../navigation/types';

const W = Dimensions.get('window').width;
const money = (n: number) => `$${Number(n).toFixed(2)}`;

export default function RentalItem({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'RentalItem'>) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<Item | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    RentalsService.item(route.params.itemId)
      .then((r) => setItem(r.data?.data ?? null))
      .catch((e) => Alert.alert('Rental', apiError(e), [{ text: 'OK', onPress: () => navigation.goBack() }]));
  }, [route.params.itemId, navigation]);

  const free = useMemo(() => new Map((item?.calendar ?? []).map((c) => [c.date, c.available])), [item]);
  const freeOn = (d: Date) => free.get(dayKey(d)) ?? item?.quantity ?? 0;

  // the most units free on every day of the chosen range
  const maxQty = useMemo(() => {
    if (!item || !start) return item?.quantity ?? 1;
    const last = end ?? start;
    let min = item.quantity;
    for (let d = new Date(start); !isBefore(last, d); d.setDate(d.getDate() + 1)) min = Math.min(min, freeOn(d));
    return min;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, start, end, free]);

  useEffect(() => {
    if (qty > maxQty) setQty(Math.max(1, maxQty));
  }, [maxQty, qty]);

  // first tap picks pickup, second picks return; tapping again starts over
  const pick = (d: Date) => {
    if (!start || end || isBefore(d, start)) {
      setStart(d);
      setEnd(null);
      return;
    }
    if (isSameDay(d, start)) return setEnd(d);
    for (let x = new Date(start); !isBefore(d, x); x.setDate(x.getDate() + 1)) {
      if (freeOn(x) < 1) return Alert.alert('Not available', `${item?.title} is fully booked on ${format(x, 'EEE d MMM')}. Pick a shorter range.`);
    }
    setEnd(d);
  };

  if (!item) return <ActivityIndicator color={DARK.accent} style={s.loading} />;

  const days = start ? differenceInCalendarDays(end ?? start, start) + 1 : 0;
  const ready = !!start && maxQty >= 1;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={s.hero}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / W))}>
            {item.images.length ? (
              item.images.map((uri) => <Image key={uri} source={{ uri }} style={{ width: W, height: 300 }} resizeMode="cover" />)
            ) : (
              <View style={[s.noPhoto, { width: W }]}><Ionicons name="cube-outline" size={48} color={DARK.muted} /></View>
            )}
          </ScrollView>
          <View style={[s.heroHeader, { top: insets.top + 8 }]}>
            <ScreenHeader title="" onBack={() => navigation.goBack()} light />
          </View>
          {item.images.length > 1 && (
            <View style={s.dots}>{item.images.map((_, i) => <View key={i} style={[s.dot, i === photo && s.dotOn]} />)}</View>
          )}
        </View>

        <View style={{ padding: 20, gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Text style={s.h1}>{item.title}</Text>
            <Pressable style={s.meta} onPress={() => item.vendor && navigation.navigate('VendorProfile', { vendorId: item.vendor.id })} accessibilityRole="link">
              <Ionicons name="storefront-outline" size={16} color={DARK.accent} />
              <Text style={s.vendor}>{item.vendor?.name ?? 'Vendor'}</Text>
            </Pressable>
            {!!item.location && (
              <View style={s.meta}>
                <Ionicons name="location-outline" size={16} color={DARK.muted} />
                <Text style={s.muted}>{item.location}</Text>
              </View>
            )}
          </View>

          <View style={s.facts}>
            <Fact icon="pricetag-outline" label="Per day" value={money(item.daily_rate)} />
            <Fact icon="shield-checkmark-outline" label="Deposit / unit" value={item.deposit_amount > 0 ? money(item.deposit_amount) : 'None'} />
            <Fact icon="layers-outline" label="In stock" value={String(item.quantity)} />
          </View>

          {!!item.description && <Text style={s.body}>{item.description}</Text>}

          <Card style={{ gap: 14 }}>
            <Text style={s.h2}>Pick your dates</Text>
            <Text style={s.muted}>
              {!start ? 'Tap the pickup day, then the return day.' : !end ? `Pickup ${format(start, 'EEE d MMM')} · now tap the return day` : `${format(start, 'EEE d MMM')} → ${format(end, 'EEE d MMM')} · ${days} day${days > 1 ? 's' : ''}`}
            </Text>
            <MonthCalendar
              value={start}
              rangeEnd={end}
              onChange={pick}
              isDisabled={(d) => freeOn(d) < 1}
              badge={(d) => {
                const n = freeOn(d);
                return n < item.quantity && n > 0 ? `${n} left` : undefined;
              }}
            />
          </Card>

          <Card style={s.qtyCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>Quantity</Text>
              <Text style={s.muted}>{start ? `${maxQty} available for these dates` : `Up to ${item.quantity}`}</Text>
            </View>
            <Stepper value={qty} min={1} max={Math.max(1, maxQty)} onChange={setQty} />
          </Card>

          {start && (
            <View style={s.estimate}>
              <Text style={s.muted}>{qty} × {money(item.daily_rate)} × {days} day{days > 1 ? 's' : ''}</Text>
              <Text style={s.estimateValue}>{money(item.daily_rate * qty * days)}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
        <GradientButton
          title={!start ? 'Pick dates' : maxQty < 1 ? 'Sold out for these dates' : 'Continue'}
          onPress={() => {
            if (!ready || !start) return;
            navigation.navigate('RentalCheckout', {
              vendorId: item.vendor_id,
              vendorName: item.vendor?.name ?? 'Vendor',
              startDate: dayKey(start),
              endDate: dayKey(end ?? start),
              lines: [{ item_id: item.id, quantity: qty, title: item.title, image: item.images[0], daily_rate: item.daily_rate }],
            });
          }}
        />
      </View>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Ionicons name={icon} size={18} color={DARK.accent} />
      <Text style={s.factValue}>{value}</Text>
      <Text style={s.factLabel}>{label}</Text>
    </View>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} style={[s.stepBtn, value <= min && { opacity: 0.35 }]} accessibilityLabel="Fewer" hitSlop={6}>
        <Ionicons name="remove" size={18} color="#fff" />
      </Pressable>
      <Text style={s.stepValue} accessibilityLabel={`Quantity ${value}`}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={[s.stepBtn, value >= max && { opacity: 0.35 }]} accessibilityLabel="More" hitSlop={6}>
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  loading: { flex: 1, backgroundColor: DARK.bg },
  hero: { height: 300, backgroundColor: DARK.card },
  heroHeader: { position: 'absolute', left: 0, right: 0 },
  noPhoto: { height: 300, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  h1: { color: '#fff', fontSize: 24, lineHeight: 30, fontFamily: FONTS.bold },
  h2: { color: '#fff', fontSize: 17, fontFamily: FONTS.semibold },
  body: { color: '#E9DDEB', fontSize: 15, lineHeight: 23, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  vendor: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  facts: { flexDirection: 'row', gap: 10 },
  fact: { flex: 1, backgroundColor: DARK.card, borderRadius: 14, padding: 12, gap: 4 },
  factValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  factLabel: { color: DARK.muted, fontSize: 11, fontFamily: FONTS.medium },
  qtyCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: DARK.field, borderRadius: 24, padding: 4 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold, minWidth: 22, textAlign: 'center' },
  estimate: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  estimateValue: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg },
});
