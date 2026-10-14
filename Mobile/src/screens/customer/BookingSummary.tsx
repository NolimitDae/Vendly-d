import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader } from '../../components/brand';
import SignContractView from '../../components/contracts/SignContractView';
import { DARK, FONTS } from '../../constants/colors';
import AddCardSheet from '../../components/AddCardSheet';
import { CardRow } from './PaymentMethods';
import { PaymentsService, PLAN_LABELS, type PaymentPlan, type SavedCard } from '../../services/payments.service';
import { openChatWith } from '../../navigation/openChat';
import { BookingService } from '../../services/booking.service';
import { ContractsService, apiError, deviceTimezone, type BookingFields, type SignaturePayload } from '../../services/contracts.service';
import type { CustomerHomeStackParams } from '../../navigation/types';

interface Preview {
  title: string;
  body: string;
  content_sha256: string;
  preview_token: string;
  source_pdf_url: string | null;
  consent_text: string;
  missing_message: string | null;
  pricing?: { price: number; service_fee: number; total: number; plan?: PaymentPlan; schedule?: { label: string; amount: number; due_at: string; capture_manually: boolean }[] };
}

const money = (n: number | undefined) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export default function BookingSummary({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'BookingSummary'>) {
  const { listing, draft } = route.params;
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [card, setCard] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  useEffect(() => {
    PaymentsService.cards()
      .then((r) => {
        const list = r.data?.data ?? [];
        setCards(list);
        setCard((list.find((c) => c.is_default) ?? list[0])?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const fields: BookingFields = {
    listing_id: listing.id,
    vendor_id: listing.vendorId,
    scheduled_at: draft.startAt,
    event_start_at: draft.startAt,
    event_end_at: draft.endAt,
    venue_address: draft.venue,
    guest_count: draft.guests,
    message: draft.notes,
    event_id: listing.eventId,
    timezone: deviceTimezone(),
    payment_method_id: card ?? undefined,
  };

  // The contract preview is also where the real price breakdown comes from.
  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ContractsService.bookingPreview(fields);
      setPreview(res.data?.data ?? null);
    } catch (err) {
      Alert.alert('Could not prepare the contract', apiError(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, draft]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const review = () => {
    if (!card) return Alert.alert('Payment method', 'Add a card first. It is only charged once the vendor accepts.');
    if (!preview) return loadPreview();
    if (preview.missing_message) return Alert.alert('More details needed', preview.missing_message);
    setSigning(true);
  };

  const signAndSend = async (signature: SignaturePayload) => {
    if (!preview) return;
    setBusy(true);
    try {
      await BookingService.createBooking({ ...fields, preview_token: preview.preview_token, signature });
      setSigning(false);
      setSent(true);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        Alert.alert('Contract updated', 'The vendor changed the contract. Please review it again.');
        setSigning(false);
        await loadPreview();
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110, gap: 20, paddingHorizontal: 20 }}>
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
          <Row icon="location-outline" label="Address" value={draft.venue} />
          <Row icon="calendar-outline" label="Date" value={format(start, 'EEE, dd MMM yyyy')} />
          <Row icon="time-outline" label="Time" value={`${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`} />
          {draft.guests != null && <Row icon="people-outline" label="Guests" value={String(draft.guests)} />}
          {!!draft.notes && <Row icon="chatbox-ellipses-outline" label="Notes" value={draft.notes} />}

          <View style={s.dashed} />

          <Text style={s.h2}>Price Details</Text>
          {loading ? (
            <ActivityIndicator color={DARK.accent} />
          ) : (
            <>
              <Row label="Service price" value={money(price?.price ?? listing.price)} />
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
            </View>
          )}
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={16} color={DARK.accent} />
            <Text style={s.noteText}>Nothing is charged now. Your card is charged once {listing.vendorName} accepts, and Vendly holds the money until the service is done.</Text>
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

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
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
            <GradientButton title="Go Back to Home" onPress={() => { setSent(false); navigation.popToTop(); }} style={{ alignSelf: 'stretch' }} />
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
  rowValue: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium, flex: 1, textAlign: 'right' },
  rowBold: { color: '#fff', fontFamily: FONTS.semibold },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: DARK.field, marginVertical: 4 },
  line: { height: 1, backgroundColor: DARK.field },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  noteText: { flex: 1, color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  planText: { color: DARK.accent, fontSize: 13, fontFamily: FONTS.medium },
  addCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addCardText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: DARK.card, borderRadius: 24, padding: 32, alignItems: 'center', gap: 16 },
  checkRing: { width: 116, height: 116, borderRadius: 58, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  check: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  sentTitle: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold },
  sentBody: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular, textAlign: 'center', marginBottom: 8 },
  outline: { alignSelf: 'stretch', height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
});
