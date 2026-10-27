import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, Card, Chip, GradientButton, ScreenHeader, ui } from '../../components/brand';
import LocationPicker from '../../components/LocationPicker';
import AddCardSheet from '../../components/AddCardSheet';
import { DARK, FONTS } from '../../constants/colors';
import { CardRow } from './PaymentMethods';
import { Stepper } from './RentalItem';
import { PaymentsService, type SavedCard } from '../../services/payments.service';
import { RentalsService, type RentalItem, type RentalQuote } from '../../services/rentals.service';
import { apiError } from '../../services/contracts.service';
import { openChatWith } from '../../navigation/openChat';
import { haptic } from '../../utils/haptics';
import type { CustomerHomeStackParams } from '../../navigation/types';

const money = (n: number | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export default function RentalCheckout({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'RentalCheckout'>) {
  const { vendorId, vendorName, startDate, endDate } = route.params;
  const insets = useSafeAreaInsets();
  // the bottom buttons float over the page; it scrolls far enough to clear them
  const [footerH, setFooterH] = useState(0);
  // item_id → quantity; starts with what was picked on the item page
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(route.params.lines.map((l) => [l.item_id, l.quantity])));
  const [catalog, setCatalog] = useState<RentalItem[]>([]);
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [venue, setVenue] = useState('');
  // delivered to an address, or picked up from the vendor (as every item in the order allows)
  const [handover, setHandover] = useState<'delivery' | 'pickup' | null>(null);
  const [notes, setNotes] = useState('');
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [card, setCard] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    PaymentsService.cards()
      .then((r) => {
        const list = r.data?.data ?? [];
        setCards(list);
        setCard((list.find((c) => c.is_default) ?? list[0])?.id ?? null);
      })
      .catch(() => {});
    // the rest of this vendor's stock, with availability for these dates, so it can be added to the same booking
    RentalsService.browse({ vendor_id: vendorId, start_date: startDate, end_date: endDate })
      .then((r) => setCatalog(r.data?.data ?? []))
      .catch(() => {});
  }, [vendorId, startDate, endDate]);

  const lines = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([item_id, quantity]) => ({ item_id, quantity })), [qty]);

  const offers = quote?.handover ?? { delivery: true, pickup: true };
  const way = offers.delivery && offers.pickup ? handover : offers.delivery ? 'delivery' : offers.pickup ? 'pickup' : null;
  // a delivered order is quoted with its address, so the delivery fee shows as it's entered
  const deliverTo = way === 'delivery' ? venue.trim() : '';

  const refreshQuote = useCallback(async () => {
    if (!lines.length) return setQuote(null);
    setQuoting(true);
    try {
      const res = await RentalsService.quote({ lines, start_date: startDate, end_date: endDate, customer_comes: way ? way === 'pickup' : undefined, venue_address: deliverTo || undefined });
      setQuote(res.data?.data ?? null);
    } catch (e) {
      Alert.alert('Rental', apiError(e));
    } finally {
      setQuoting(false);
    }
  }, [lines, startDate, endDate, way, deliverTo]);

  useEffect(() => {
    const t = setTimeout(refreshQuote, deliverTo ? 600 : 250);
    return () => clearTimeout(t);
  }, [refreshQuote, deliverTo]);

  const send = async () => {
    if (!lines.length) return Alert.alert('Nothing selected', 'Add at least one item.');
    if (!offers.delivery && !offers.pickup) return Alert.alert('Delivery or pickup', 'Some of these items are delivery only and some pickup only. Rent them separately.');
    if (!way) return Alert.alert('Delivery or pickup', 'Choose how you get the items.');
    if (way === 'delivery' && !venue.trim()) return Alert.alert('Delivery address', 'Enter where the vendor should deliver.');
    if (way === 'delivery' && quote?.delivery?.status === 'UNPRICED') return Alert.alert('Delivery address', quote.delivery.message ?? 'Check the delivery address.');
    // no card yet: go straight to adding one (it's only charged once the vendor accepts)
    if (!card) return setAddingCard(true);
    if (quote && !quote.available) return Alert.alert('Not enough stock', 'Lower the quantity of the items marked in red, or pick other dates.');
    setBusy(true);
    try {
      const pickup = way === 'pickup';
      await RentalsService.book({ lines, start_date: startDate, end_date: endDate, customer_comes: pickup, venue_address: pickup ? undefined : venue.trim(), message: notes.trim() || undefined, payment_method_id: card });
      setSent(true);
      haptic.success();
    } catch (e) {
      Alert.alert('Could not send the request', apiError(e));
      refreshQuote();
    } finally {
      setBusy(false);
    }
  };

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const lineInfo = new Map((quote?.lines ?? []).map((l) => [l.item_id, l]));
  const picked = route.params.lines.map((l) => l.item_id);
  const extras = catalog.filter((c) => !picked.includes(c.id));

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: (footerH || insets.bottom + 110) + 16, gap: 20, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={{ marginHorizontal: -20 }}>
          <ScreenHeader title="Rental Request" onBack={() => navigation.goBack()} />
        </View>

        <Card style={s.dates}>
          <DateBox label="Pickup" date={start} />
          <Ionicons name="arrow-forward" size={20} color={DARK.accent} />
          <DateBox label="Return" date={end} />
          <View style={s.days}>
            <Text style={s.daysValue}>{quote?.days ?? '—'}</Text>
            <Text style={s.daysLabel}>days</Text>
          </View>
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={s.h2}>Items from {vendorName}</Text>
          {route.params.lines.map((l) => {
            const info = lineInfo.get(l.item_id);
            const max = byId.get(l.item_id)?.available ?? info?.available ?? l.quantity;
            return (
              <LineRow key={l.item_id} title={l.title} image={l.image} rate={l.daily_rate} qty={qty[l.item_id] ?? 0} max={Math.max(qty[l.item_id] ?? 0, max)} min={0} problem={info && !info.ok ? `Only ${info.available} free` : undefined} onChange={(n) => setQty((q) => ({ ...q, [l.item_id]: n }))} />
            );
          })}
          {extras.length > 0 && (
            <>
              <View style={s.dashed} />
              <Text style={s.muted}>Add more from this vendor</Text>
              {extras.map((c) => {
                const info = lineInfo.get(c.id);
                return (
                  <LineRow key={c.id} title={c.title} image={c.images[0]} rate={c.daily_rate} qty={qty[c.id] ?? 0} min={0} max={c.available ?? c.quantity} problem={info && !info.ok ? `Only ${info.available} free` : c.available === 0 ? 'Booked for these dates' : undefined} onChange={(n) => setQty((q) => ({ ...q, [c.id]: n }))} />
                );
              })}
            </>
          )}
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={s.h2}>Delivery or pickup</Text>
          {offers.delivery && offers.pickup ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Chip label="Delivery" active={way === 'delivery'} onPress={() => setHandover('delivery')} />
              <Chip label="I'll pick it up" active={way === 'pickup'} onPress={() => setHandover('pickup')} />
            </View>
          ) : (
            <Text style={s.muted}>
              {offers.delivery ? 'Delivered by the vendor.' : offers.pickup ? 'Pickup only: you collect it from the vendor.' : 'Some of these items are delivery only and some pickup only. Rent them separately.'}
            </Text>
          )}
          {way === 'delivery' && <LocationPicker value={{ label: venue }} onChange={(p) => setVenue(p.label)} label="Delivery address" placeholder="Delivery address" street />}
          {way === 'delivery' && !!quote?.delivery_terms && <Text style={s.muted}>Delivery fee: {quote.delivery_terms}.</Text>}
          {way === 'delivery' && !!quote?.delivery?.message && <Text style={[s.muted, { color: '#F5B700' }]}>{quote.delivery.message}</Text>}
          {way === 'pickup' && <Text style={s.muted}>You&apos;ll see where to pick it up once the vendor accepts.</Text>}
          <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
            <Ionicons name="chatbox-ellipses-outline" size={20} color={DARK.muted} style={{ marginTop: 2 }} />
            <TextInput style={[ui.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Pickup time, colours, setup needs…" placeholderTextColor={DARK.muted} value={notes} onChangeText={setNotes} multiline />
          </View>
        </Card>

        <Card style={{ gap: 12, borderWidth: 1, borderColor: DARK.field }}>
          <Text style={s.h2}>Price Details</Text>
          {quoting && !quote ? (
            <ActivityIndicator color={DARK.accent} />
          ) : quote ? (
            <>
              <Row label="Rental" value={money(quote.subtotal)} />
              {!!quote.delivery_fee && <Row label={`Delivery${quote.delivery?.label ? ` · ${quote.delivery.label}` : ''}`} value={money(quote.delivery_fee)} />}
              <Row label="Vendly Protection fee" value={money(quote.service_fee)} />
              <View style={s.line} />
              <Row label="Charged when accepted" value={money(quote.due_on_accept)} bold />
              {quote.security_deposit > 0 && (
                <View style={s.depositBox}>
                  <Row label="Refundable security deposit" value={money(quote.security_deposit)} />
                  <Text style={s.noteText}>Held on your card the day before pickup, not charged. It is released when the vendor checks the items back in, unless they report damage or a late return.</Text>
                </View>
              )}
            </>
          ) : (
            <Text style={s.muted}>Add an item to see the price.</Text>
          )}
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Nothing is charged now. {vendorName} has to accept first, and Vendly holds the money until the rental is returned.</Text>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={s.h2}>Payment method</Text>
          {cards.length === 0 && <Text style={s.noteText}>No saved cards yet. Add one to send your request.</Text>}
          {cards.map((c) => <CardRow key={c.id} card={c} selected={card === c.id} onPress={() => setCard(c.id)} />)}
          <Pressable onPress={() => setAddingCard(true)} style={s.addCard} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
            <Text style={s.addCardText}>Add a card</Text>
          </Pressable>
        </Card>
        <AddCardSheet visible={addingCard} onClose={() => setAddingCard(false)} onSaved={(id) => { setCard(id); PaymentsService.cards().then((r) => setCards(r.data?.data ?? [])).catch(() => {}); }} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none" onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
        <GradientButton title={quote ? `Send Request · ${money(quote.due_on_accept)}` : 'Send Request'} onPress={send} loading={busy} />
      </View>

      <Modal visible={sent} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.checkRing}>
              <BrandGradient style={s.check}>
                <Ionicons name="checkmark" size={56} color="#fff" />
              </BrandGradient>
            </View>
            <Text style={s.sentTitle}>Request Sent!</Text>
            <Text style={s.sentBody}>{vendorName} will confirm the items are ready for your dates. Your card is charged once they accept.</Text>
            <GradientButton title="Go Back to Home" onPress={() => { setSent(false); navigation.popToTop(); }} style={{ alignSelf: 'stretch' }} />
            <Pressable style={s.outline} onPress={() => { setSent(false); navigation.popToTop(); openChatWith(navigation, vendorId, vendorName); }} accessibilityRole="button">
              <Text style={s.outlineText}>Send Vendor Message</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DateBox({ label, date }: { label: string; date: Date }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={s.daysLabel}>{label}</Text>
      <Text style={s.dateValue}>{format(date, 'EEE d MMM')}</Text>
    </View>
  );
}

function LineRow({ title, image, rate, qty, min, max, problem, onChange }: { title: string; image?: string; rate: number; qty: number; min: number; max: number; problem?: string; onChange: (n: number) => void }) {
  return (
    <View style={s.lineRow}>
      <View style={s.thumb}>{image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} /> : <Ionicons name="cube-outline" size={22} color={DARK.muted} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.lineTitle} numberOfLines={2}>{title}</Text>
        <Text style={[s.muted, !!problem && { color: '#FF8A8A' }]}>{problem ?? `${money(rate)}/day`}</Text>
      </View>
      <Stepper value={qty} min={min} max={max} onChange={onChange} />
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && s.rowBold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowBold]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  dates: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  days: { marginLeft: 'auto', alignItems: 'center', backgroundColor: DARK.field, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  daysValue: { color: '#fff', fontSize: 18, fontFamily: FONTS.bold },
  daysLabel: { color: DARK.muted, fontSize: 11, fontFamily: FONTS.medium },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  lineTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: DARK.field },
  line: { height: 1, backgroundColor: DARK.field },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  rowLabel: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.regular, flexShrink: 1 },
  rowValue: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  rowBold: { color: '#fff', fontFamily: FONTS.semibold },
  depositBox: { backgroundColor: DARK.field, borderRadius: 12, padding: 12, gap: 6, marginTop: 4 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  noteText: { flex: 1, color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addCardText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: DARK.card, borderRadius: 24, padding: 32, alignItems: 'center', gap: 16 },
  checkRing: { width: 116, height: 116, borderRadius: 58, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  check: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  sentTitle: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold },
  sentBody: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular, textAlign: 'center', marginBottom: 8 },
  outline: { alignSelf: 'stretch', height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
});
