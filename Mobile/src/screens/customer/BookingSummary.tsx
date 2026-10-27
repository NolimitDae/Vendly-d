import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader } from '../../components/brand';
import SignContractView from '../../components/contracts/SignContractView';
import { DARK, FONTS } from '../../constants/colors';
import AddCardSheet from '../../components/AddCardSheet';
import AddBankSheet from '../../components/AddBankSheet';
import { InspirationPhotosPicker, type PickedPhoto } from '../../components/booking/InspirationPhotos';
import { CardRow } from './PaymentMethods';
import { BANK_CLEARING_TEXT, isBankAccount, PaymentsService, PLAN_LABELS, wholeMoney, type PaymentPlan, type SavedCard } from '../../services/payments.service';
import { usePaymentSettings } from '../../hooks/usePaymentSettings';
import { openChatWith } from '../../navigation/openChat';
import { haptic } from '../../utils/haptics';
import { BookingService } from '../../services/booking.service';
import { ContractsService, apiError, deviceTimezone, type BookingFields, type SignaturePayload } from '../../services/contracts.service';
import type { CustomerHomeStackParams } from '../../navigation/types';
import type { AddOn } from '../../services/addons.service';
import { depositRuleText, isDepositPlan } from '../../utils/bookingStatus';
import type { ChosenCustomization } from '../../utils/packageOptions';

interface Preview {
  title: string;
  body: string;
  content_sha256: string;
  preview_token: string;
  source_pdf_url: string | null;
  consent_text: string;
  missing_message: string | null;
  pricing?: Pricing;
}

interface Pricing {
  /** vendor price including add-ons, after any promo */
  price: number;
  service_fee: number;
  total: number;
  plan?: PaymentPlan;
  schedule?: { label: string; amount: number; due_at: string; capture_manually: boolean }[];
  discount?: number;
  promo_code?: string | null;
  quote?: { id: string; title: string; amount: number } | null;
  /** the package line, e.g. "$45.00 per person × 120 guests" */
  package?: { label: string; unit: string; quantity: number; unit_price: number; amount: number } | null;
  add_ons?: { add_on_id: string; name: string; label: string; quantity: number; unit_price: number; amount: number }[];
  /** the customizations picked, priced by the server */
  options?: ChosenCustomization[];
  /** fees the vendor may request after the service */
  fees?: AddOn[];
  /** large bookings (Admin → Settings): 48 hours to fix a failed payment, and a bank account can pay */
  large?: boolean;
  bank_allowed?: boolean;
  payment_due_hours?: number;
}

const money = (n: number | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export default function BookingSummary({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'BookingSummary'>) {
  const { listing, draft } = route.params;
  const insets = useSafeAreaInsets();
  // the bottom buttons float over the page; it scrolls far enough to clear them
  const [footerH, setFooterH] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [card, setCard] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  const paymentSettings = usePaymentSettings();
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<string | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  // saved bank accounts come too; they're shown only when the booking turns out large enough
  const loadCards = () => PaymentsService.cards({ bank: true }).then((r) => r.data?.data ?? []);
  useEffect(() => {
    loadCards()
      .then((list) => {
        setCards(list);
        const cardsOnly = list.filter((c) => !isBankAccount(c));
        setCard((cardsOnly.find((c) => c.is_default) ?? cardsOnly[0])?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const fields: BookingFields = {
    listing_id: listing.id,
    vendor_id: listing.vendorId,
    scheduled_at: draft.startAt,
    event_start_at: draft.startAt,
    event_end_at: draft.endAt,
    // venues and packages at the vendor's place: no address (the vendor's place is shown once they accept)
    venue_address: draft.venue || undefined,
    guest_count: draft.guests,
    message: draft.notes,
    event_id: listing.eventId,
    timezone: deviceTimezone(),
    payment_method_id: card ?? undefined,
    promo_code: promo,
    quote_id: listing.quoteId,
    // the same picks go to the preview and the booking request
    add_ons: draft.addOns?.length ? draft.addOns : undefined,
    options: draft.options?.length ? draft.options : undefined,
  };

  // The contract preview is also where the real price breakdown comes from.
  const loadPreview = useCallback(async () => {
    setLoading(true);
    setPreviewError(null);
    try {
      const res = await ContractsService.bookingPreview(fields);
      setPreview(res.data?.data ?? null);
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (promo) {
        // a bad code shouldn't block the booking: tell the customer and price it without the code
        Alert.alert('Promo code', apiError(err));
        setPromo(undefined);
      } else {
        // e.g. too few guests or an add-on no longer offered: the server's words say what to change
        setPreview(null);
        if (status === 400) setPreviewError(apiError(err));
        Alert.alert(status === 400 ? 'Check your booking' : 'Could not prepare the contract', apiError(err));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, draft, promo]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  // a bank account can pay only for a large booking (the preview says); otherwise only cards are shown
  const bankOk = !!preview?.pricing?.bank_allowed;
  const shownCards = bankOk ? cards : cards.filter((c) => !isBankAccount(c));
  useEffect(() => {
    if (!bankOk && card && cards.some((c) => c.id === card && isBankAccount(c))) setCard(cards.find((c) => !isBankAccount(c))?.id ?? null);
  }, [bankOk, card, cards]);

  const review = () => {
    // no card yet: go straight to adding one (it's only charged once the vendor accepts)
    if (previewError) return Alert.alert('Check your booking', previewError, [{ text: 'Go back and change it', onPress: () => navigation.goBack() }, { text: 'OK', style: 'cancel' }]);
    if (!card) return setAddingCard(true);
    if (!preview) return loadPreview();
    if (preview.missing_message) return Alert.alert('More details needed', preview.missing_message);
    setSigning(true);
  };

  const signAndSend = async (signature: SignaturePayload) => {
    if (!preview) return;
    setBusy(true);
    try {
      await BookingService.createBooking({ ...fields, preview_token: preview.preview_token, signature }, photos);
      setSigning(false);
      setSent(true);
      haptic.success();
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.error;
      if (status === 409 && code === 'CONTRACT_CHANGED') {
        Alert.alert('Contract updated', 'The vendor changed the contract. Please review it again.');
        setSigning(false);
        await loadPreview();
      } else if (status === 409 && /already sent/i.test(apiError(err))) {
        // the first try went through (e.g. its answer was lost): signing again would send a second request
        setSigning(false);
        setSent(true);
      } else if (code === 'DATE_UNAVAILABLE' || code === 'OUTSIDE_WORKING_HOURS') {
        setSigning(false);
        Alert.alert(code === 'DATE_UNAVAILABLE' ? 'Date not available' : 'Outside the vendor’s hours', apiError(err), [
          { text: 'Pick another time', onPress: () => navigation.goBack() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Could not send the request', apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const price = preview?.pricing;
  const start = parseISO(draft.startAt);
  const end = parseISO(draft.endAt);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: (footerH || insets.bottom + 110) + 16, gap: 20, paddingHorizontal: 20 }}>
        <View style={{ marginHorizontal: -20 }}>
          <ScreenHeader title="Booking Information" onBack={() => navigation.goBack()} />
        </View>

        <Card style={s.listingCard}>
          <View style={s.thumb}>
            {listing.image ? <Image source={{ uri: listing.image }} style={StyleSheet.absoluteFill} /> : <Ionicons name="image-outline" size={28} color={DARK.muted} />}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.h2} numberOfLines={2}>{listing.title}</Text>
            <Text style={s.body}>Vendor · {listing.vendorName}</Text>
            <View style={s.meta}>
              <Ionicons name="star" size={16} color="#F5B700" />
              <Text style={s.body}>
                {listing.rating != null ? Number(listing.rating).toFixed(1) : 'New'}  |  ({listing.reviewCount ?? 0} Reviews)
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ gap: 16, borderWidth: 1, borderColor: DARK.field }}>
          <Text style={s.h2}>Your Service</Text>
          <Row icon="cube-outline" label="Service" value={listing.title} />
          <Row icon="storefront-outline" label="Vendor" value={listing.vendorName} />
          {draft.venue ? (
            <Row icon="location-outline" label="Address" value={draft.venue} />
          ) : (
            <Row icon="storefront-outline" label="Where" value={`At ${listing.vendorName}'s place`} />
          )}
          <Row icon="calendar-outline" label="Date" value={format(start, 'EEE, dd MMM yyyy')} />
          <Row icon="time-outline" label="Time" value={`${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`} />
          {draft.guests != null && <Row icon="people-outline" label="Guests" value={String(draft.guests)} />}
          {!!draft.notes && <Row icon="chatbox-ellipses-outline" label="Notes" value={draft.notes} />}

          <View style={s.dashed} />

          <Text style={s.h2}>Price Details</Text>
          {loading ? (
            <ActivityIndicator color={DARK.accent} />
          ) : previewError ? (
            <View style={s.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color="#fca5a5" />
              <Text style={s.errorText}>{previewError}</Text>
            </View>
          ) : (
            <>
              {!!price?.quote && <Row icon="pricetags-outline" label="Quote" value={price.quote.title} />}
              {price?.package ? (
                <Row label={price.quote ? 'Quoted price' : price.package.unit === 'fixed' ? 'Service price' : price.package.label} value={money(price.package.amount)} />
              ) : (
                !price?.add_ons?.length && <Row label={price?.quote ? 'Quoted price' : 'Service price'} value={money(price?.price ?? listing.price)} />
              )}
              {price?.options?.map((g) => (
                <Row key={g.group_id} label={`${g.title}: ${g.options.map((o) => o.label).join(', ')}`} value={g.amount > 0 ? `+${money(g.amount)}` : 'Included'} />
              ))}
              {price?.add_ons?.map((a) => <Row key={a.add_on_id} label={a.label} value={money(a.amount)} />)}
              {!!price?.discount && <Row label={`Promo ${price.promo_code ?? ''}`} value={`-${money(price.discount)}`} />}
              {(!!price?.add_ons?.length || !!price?.options?.some((g) => g.amount > 0) || !!price?.discount) && <Row label="Subtotal" value={money(price?.price)} />}
              <Row label="Vendly Protection fee" value={money(price?.service_fee)} />
              <View style={s.line} />
              <Row label="Total" value={money(price?.total ?? listing.price)} bold />
            </>
          )}
          {price?.schedule && price.schedule.length > 0 && (
            <View style={{ gap: 6, marginTop: 4 }}>
              {price.plan && <Text style={s.planText}>{PLAN_LABELS[price.plan]}</Text>}
              {price.schedule.map((i, idx) => (
                <View key={idx} style={s.row}>
                  <Text style={s.rowLabel}>{i.label} · {idx === 0 && !i.capture_manually ? 'when the vendor accepts' : format(parseISO(i.due_at), 'dd MMM yyyy')}</Text>
                  <Text style={s.rowValue}>{money(i.amount)}</Text>
                </View>
              ))}
              {isDepositPlan(price.plan) && <Text style={[s.rowLabel, { color: '#fcd34d' }]}>{depositRuleText(paymentSettings.large_payment_threshold)}</Text>}
            </View>
          )}
          {!!price?.fees?.length && (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={s.planText}>Possible fees after the service</Text>
              <Text style={s.noteText}>Each is only charged if it applies, and only after you approve it.</Text>
              {price.fees.map((f) => (
                <View key={f.id} style={s.row}>
                  <Text style={[s.rowLabel, { fontSize: 14, flexShrink: 1 }]}>{f.name}</Text>
                  <Text style={[s.rowValue, { fontSize: 14 }]}>{f.price_text}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Nothing is charged now. Your card is charged once {listing.vendorName} accepts, and Vendly holds the money until the service is done.</Text>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={s.h2}>Inspiration photos</Text>
          <Text style={s.noteText}>Show {listing.vendorName} what you have in mind (optional).</Text>
          <InspirationPhotosPicker photos={photos} onChange={setPhotos} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={s.h2}>Promo</Text>
          <View style={s.promoRow}>
            <Ionicons name="pricetag-outline" size={20} color={DARK.accent} />
            <TextInput
              style={s.promoInput}
              placeholder="Promo code"
              placeholderTextColor={DARK.muted}
              autoCapitalize="characters"
              value={promoInput}
              onChangeText={(t) => setPromoInput(t.toUpperCase())}
            />
            <Pressable onPress={() => setPromo(promoInput.trim() || undefined)} hitSlop={8} accessibilityRole="button">
              <Text style={s.addCardText}>{promo && promo === promoInput.trim() ? 'Applied' : 'Apply'}</Text>
            </Pressable>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={s.h2}>Payment method</Text>
          {shownCards.length === 0 && <Text style={s.noteText}>No saved cards yet. Add one to send your request.</Text>}
          {shownCards.map((c) => <CardRow key={c.id} card={c} selected={card === c.id} onPress={() => setCard(c.id)} />)}
          <Pressable onPress={() => setAddingCard(true)} style={s.addCard} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={22} color={DARK.accent} />
            <Text style={s.addCardText}>Add a card</Text>
          </Pressable>
          {bankOk && (
            <>
              <Pressable onPress={() => setAddingBank(true)} style={s.addCard} accessibilityRole="button">
                <Ionicons name="business-outline" size={22} color={DARK.accent} />
                <Text style={s.addCardText}>Add a bank account</Text>
              </Pressable>
              <Text style={s.noteText}>
                This booking is {wholeMoney(paymentSettings.large_payment_threshold ?? 5000)} or more, so you can pay from a bank account instead of a card. Bank payments take {BANK_CLEARING_TEXT} to clear and show as Processing until then.
              </Text>
            </>
          )}
        </Card>
        <AddCardSheet visible={addingCard} onClose={() => setAddingCard(false)} onSaved={(id) => { setCard(id); loadCards().then(setCards).catch(() => {}); }} />
        <AddBankSheet visible={addingBank} onClose={() => setAddingBank(false)} onSaved={(id) => { setCard(id); loadCards().then(setCards).catch(() => {}); }} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none" onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
        <GradientButton title="Review Contract" onPress={review} loading={loading} />
      </View>

      <Modal visible={signing} animationType="slide" onRequestClose={() => setSigning(false)}>
        {preview && (
          <SignContractView
            title={preview.title}
            body={preview.body}
            contentSha256={preview.content_sha256}
            consentText={preview.consent_text}
            sourcePdfUrl={preview.source_pdf_url}
            submitLabel="Sign & Send Request"
            busy={busy}
            onSubmit={signAndSend}
            onCancel={() => setSigning(false)}
          />
        )}
      </Modal>

      <Modal visible={sent} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.checkRing}>
              <BrandGradient style={s.check}>
                <Ionicons name="checkmark" size={56} color="#fff" />
              </BrandGradient>
            </View>
            <Text style={s.sentTitle}>Request Sent!</Text>
            <Text style={s.sentBody}>
              {listing.vendorName} will review your request. Once they accept and sign, you'll be asked to pay and the booking is locked in.
            </Text>
            <GradientButton
              title="Go Back to Home"
              onPress={() => {
                setSent(false);
                navigation.popToTop();
                // a quote booked from a chat runs on the Messages tab: Home is the other tab
                (navigation.getParent() as any)?.navigate('HomeTab');
              }}
              style={{ alignSelf: 'stretch' }}
            />
            <Pressable
              style={s.outline}
              onPress={() => { setSent(false); navigation.popToTop(); openChatWith(navigation, listing.vendorId, listing.vendorName); }}
              accessibilityRole="button"
            >
              <Text style={s.outlineText}>Send Vendor Message</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ icon, label, value, bold }: { icon?: keyof typeof Ionicons.glyphMap; label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <View style={s.meta}>
        {icon && <Ionicons name={icon} size={20} color={DARK.muted} />}
        <Text style={[s.rowLabel, bold && s.rowBold]}>{label}</Text>
      </View>
      <Text style={[s.rowValue, bold && s.rowBold]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  listingCard: { flexDirection: 'row', gap: 12, padding: 12 },
  thumb: { width: 100, height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  rowLabel: { color: DARK.muted, fontSize: 16, fontFamily: FONTS.regular },
  // the value keeps its own width (amounts never get squeezed); a long label wraps instead
  rowValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium, flexShrink: 1, textAlign: 'right' },
  rowBold: { color: '#fff', fontFamily: FONTS.semibold },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: DARK.field, marginVertical: 4 },
  line: { height: 1, backgroundColor: DARK.field },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  noteText: { flex: 1, color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: DARK.field },
  errorText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  planText: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: 26, backgroundColor: DARK.field },
  promoInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.medium, paddingVertical: 0 },
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
