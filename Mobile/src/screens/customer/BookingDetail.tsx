import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { vendorAnswersWithin } from '../../utils/requests';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader } from '../../components/brand';
import BookingContractCard from '../../components/contracts/BookingContractCard';
import { InspirationPhotos } from '../../components/booking/InspirationPhotos';
import PaymentTimeline from '../../components/PaymentTimeline';
import RentalReturnCard from '../../components/RentalReturnCard';
import { DARK, FONTS } from '../../constants/colors';
import { openChatWith } from '../../navigation/openChat';
import { api } from '../../services/api';
import { BookingService, type Booking } from '../../services/booking.service';
import type { CustomerBookingsStackParams } from '../../navigation/types';
import { bookingWhen } from './Bookings';
import CustomerExtras, { ExtrasBanner } from '../../components/extras/CustomerExtras';
import { useBookingExtras } from '../../services/addons.service';
import CancelBookingSheet from '../../components/booking/CancelBookingSheet';
import { cancellationLine, dueByText, PAYMENT_STATE_LABELS } from '../../utils/bookingStatus';
import RefundCard from '../../components/booking/RefundCard';
import InvoiceButton from '../../components/booking/InvoiceButton';
import { invoiceAvailable } from '../../services/bookingMoney.service';

interface Proof { id: string; photos: string[]; notes?: string; created_at: string }
interface Deliverable { id: string; title: string; message?: string; files: string[]; links: string[]; created_at: string }

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

export default function BookingDetail() {
  const { bookingId } = useRoute<RouteProp<CustomerBookingsStackParams, 'BookingDetail'>>().params;
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const extras = useBookingExtras(bookingId);
  const scrollRef = useRef<ScrollView>(null);
  // where the add-ons section sits in the scroll content: its column's offset plus its own
  const bodyY = useRef(0);
  const extrasY = useRef(0);
  // bumped when an add-on or fee is paid, so the payments card shows the new charge
  const [paymentsKey, setPaymentsKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [b, p, d] = await Promise.all([
        BookingService.getBooking(bookingId),
        BookingService.getProofs(bookingId).catch(() => null),
        BookingService.getDeliverables(bookingId).catch(() => null),
      ]);
      if (b.data?.success) setBooking(b.data.data);
      if (p?.data?.success) setProofs(p.data.data ?? []);
      if (d?.data?.success) setDeliverables(d.data.data ?? []);
    } catch {
      Alert.alert('Error', 'Could not load this booking');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // opens the report form in the payments card (the cancel prompt's no-show hint)
  const [reporting, setReporting] = useState(false);

  // shows what cancelling does with the money first (refund, fee kept), asks why, then the refund result
  const [cancelling, setCancelling] = useState(false);
  const cancel = () => setCancelling(true);

  const payNow = async () => {
    setBusy(true);
    try {
      const res = await BookingService.createCheckout(bookingId);
      const url = res.data?.data?.checkout_url ?? res.data?.url ?? res.data?.data?.url;
      if (url) await Linking.openURL(url);
      else Alert.alert('Payment', 'Checkout started. Pull down to refresh once you have paid.');
    } catch (err: any) {
      Alert.alert('Could not start payment', err?.response?.data?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!booking || !rating) return Alert.alert('Rating', 'Tap the stars to rate the service.');
    setBusy(true);
    try {
      await api.post('/reviews', { booking_id: booking.id, rating, comment: comment.trim() || undefined });
      setReviewed(true);
    } catch (err: any) {
      Alert.alert('Could not send review', err?.response?.data?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;
  if (!booking) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.body}>Booking not found</Text>
      </View>
    );
  }

  const st = booking.status;
  const paid = !!booking.paid_at;
  const vendor = booking.vendor?.name ?? 'Vendor';
  const hero =
    booking.payment_state && booking.payment_due_by
      ? {
          title: PAYMENT_STATE_LABELS[booking.payment_state],
          body: `Your payment didn't go through. Pay by ${dueByText(booking.payment_due_by)} with your card or another card (Payments, below), or the booking is cancelled${booking.payment_state === 'pending_balance' ? ' and your deposit isn’t refunded' : ''}.`,
          icon: 'card-outline' as const,
        }
      : st === 'PENDING'
      ? { title: 'Pending Confirmation', body: `We have sent your request to ${vendor}. You'll be told as soon as they accept.`, icon: 'spinner' as const }
      : st === 'CONFIRMED' && !paid
        ? { title: 'Accepted — payment due', body: `${vendor} accepted and signed. Pay now to lock in your date. Vendly holds the money until the service is done.`, icon: 'card-outline' as const }
        : st === 'CONFIRMED'
          ? { title: 'Booking Confirmed', body: 'Paid and protected by Vendly. See you on the day!', icon: 'checkmark' as const }
          : st === 'IN_PROGRESS'
            ? { title: 'Service in Progress', body: `${vendor} has started on your booking.`, icon: 'flash-outline' as const }
            : st === 'COMPLETED'
              ? { title: 'Booking Completed Successfully', body: 'Thank you for using Vendly!', icon: 'checkmark' as const }
              : st === 'REJECTED'
                ? { title: 'Request Declined', body: `${vendor} couldn't take this booking. Nothing has been charged.`, icon: 'close' as const }
                : { title: 'Booking Cancelled', body: [cancellationLine(booking, 'CUSTOMER'), paid ? 'Your refund follows the contract’s cancellation terms.' : 'Nothing was charged.'].filter(Boolean).join('\n\n'), icon: 'close' as const };
  const headerTitle = st === 'PENDING' ? 'Booking Request' : st === 'COMPLETED' ? 'Completed Booking' : st === 'CANCELLED' || st === 'REJECTED' ? 'Booking' : 'Upcoming Booking';
  const total = Number(booking.amount ?? 0) + Number(booking.service_fee ?? 0);
  const start = booking.event_start_at ?? booking.scheduled_at;

  return (
    <View style={s.root}>
      <CancelBookingSheet
        bookingId={cancelling ? booking.id : null}
        role="CUSTOMER"
        title={st === 'PENDING' ? 'Cancel this request?' : 'Cancel this booking?'}
        onClose={() => setCancelling(false)}
        onCancelled={() => {
          load();
          setPaymentsKey((k) => k + 1);
        }}
        onReportProblem={() => {
          setReporting(true);
          setPaymentsKey((k) => k + 1);
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); extras.reload(); }} tintColor={DARK.accent} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <ScreenHeader title={headerTitle} onBack={() => nav.goBack()} />

        <ExtrasBanner meta={extras.meta} vendor={vendor} onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + extrasY.current - 12), animated: true })} />

        <View style={{ paddingHorizontal: 20, gap: 20 }} onLayout={(e) => { bodyY.current = e.nativeEvent.layout.y; }}>
          <Card style={s.hero}>
            {hero.icon === 'spinner' ? (
              <ActivityIndicator size="large" color={DARK.accent} style={{ transform: [{ scale: 1.8 }], marginVertical: 24 }} />
            ) : (
              <View style={s.ring}>
                <BrandGradient style={s.ringInner}>
                  <Ionicons name={hero.icon} size={44} color="#fff" />
                </BrandGradient>
              </View>
            )}
            <Text style={s.heroTitle}>{hero.title}</Text>
            <Text style={s.heroBody}>{hero.body}</Text>
          </Card>

          <Card style={{ gap: 16 }}>
            <View style={s.row}>
              <View style={s.avatar}>
                {booking.vendor?.avatar_url ? <Image source={{ uri: booking.vendor.avatar_url }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{vendor[0]?.toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h2}>{vendor}</Text>
                <View style={s.meta}>
                  <Ionicons name="storefront-outline" size={18} color="#fff" />
                  <Text style={s.body} numberOfLines={1}>{booking.listing?.title ?? 'Service'}</Text>
                </View>
              </View>
            </View>
            <Pressable onPress={() => openChatWith(nav, booking.vendor.id, vendor)} accessibilityRole="button">
              <BrandGradient style={s.msgBtn}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                <Text style={s.msgText}>Message {vendor.split(' ')[0]}</Text>
              </BrandGradient>
            </Pressable>
          </Card>

          <Card style={{ gap: 14, borderWidth: 1, borderColor: DARK.field }}>
            <Text style={s.h2}>Booking Details</Text>
            {!booking.is_rental && <Row icon="cube-outline" label="Service" value={booking.listing?.title ?? '—'} />}
            <Row icon="storefront-outline" label="Vendor" value={vendor} />
            {!!booking.venue_address && <Row icon="location-outline" label="Location" value={booking.venue_address} />}
            {booking.is_rental ? (
              <>
                {booking.rental_reservations?.map((r) => <Row key={r.id} icon="layers-outline" label={`${r.quantity} ×`} value={r.item.title} />)}
                {!!booking.rental_reservations?.[0] && (
                  <Row icon="calendar-outline" label="Dates" value={`${format(parseISO(booking.rental_reservations[0].start_date.slice(0, 10)), 'dd MMM')} → ${format(parseISO(booking.rental_reservations[0].end_date.slice(0, 10)), 'dd MMM yyyy')}`} />
                )}
              </>
            ) : (
              <>
                {!!start && <Row icon="calendar-outline" label="Date" value={format(parseISO(start), 'EEE, dd MMM yyyy')} />}
                {!!start && <Row icon="time-outline" label="Time" value={bookingWhen(booking).split('•')[1]?.trim() ?? format(parseISO(start), 'h:mm a')} />}
              </>
            )}
            {booking.guest_count != null && <Row icon="people-outline" label="Guests" value={String(booking.guest_count)} />}
            {!!booking.message && <Row icon="chatbox-ellipses-outline" label="Notes" value={booking.message} />}
            <InspirationPhotos urls={booking.request_photo_urls} title="Your inspiration photos" />

            <View style={s.dashed} />
            <Text style={s.h2}>Price Details</Text>
            <Row label={booking.is_rental ? 'Rental' : 'Service price'} value={money(booking.amount)} />
            <Row label="Vendly Protection fee" value={money(booking.service_fee)} />
            <View style={s.line} />
            <Row label="Total" value={money(total)} bold />
            <Text style={s.paidNote}>{paid ? `Paid on ${format(parseISO(booking.paid_at!), 'dd MMM yyyy')} · held by Vendly until the service is done` : st === 'PENDING' ? `Nothing is charged until the vendor accepts${vendorAnswersWithin(booking.request_expires_at) ? `. ${vendorAnswersWithin(booking.request_expires_at)}` : ''}` : ''}</Text>
          </Card>

          {extras.extras.length > 0 && (
            <View onLayout={(e) => { extrasY.current = e.nativeEvent.layout.y; }}>
              <CustomerExtras
                bookingId={booking.id}
                vendor={vendor}
                extras={extras.extras}
                meta={extras.meta}
                reload={extras.reload}
                onChanged={() => {
                  load();
                  setPaymentsKey((k) => k + 1);
                }}
              />
            </View>
          )}

          {st === 'CANCELLED' && <RefundCard bookingId={booking.id} role="CUSTOMER" reloadKey={paymentsKey} />}
          {st === 'CANCELLED' && !!booking.similar_vendors && (
            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>Similar vendors free on your date</Text>
              {booking.similar_vendors.items.length ? (
                booking.similar_vendors.items.map((v) => (
                  <Pressable key={v.id} onPress={() => nav.navigate('HomeTab', { screen: 'ListingDetail', params: { listingId: v.id }, initial: false })} style={s.row} accessibilityRole="button">
                    <View style={s.thumb}>{!!v.image && <Image source={{ uri: v.image }} style={StyleSheet.absoluteFill} />}</View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.body} numberOfLines={1}>{v.title}</Text>
                      <Text style={s.paidNote} numberOfLines={1}>{[v.vendor_name, money(v.price), v.avg_rating ? `${Number(v.avg_rating).toFixed(1)} stars` : null].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
                  </Pressable>
                ))
              ) : (
                <Text style={s.paidNote}>We couldn’t find another vendor free on that day yet.</Text>
              )}
              <Pressable
                onPress={() => nav.navigate('HomeTab', { screen: 'SearchResults', params: { categoryId: booking.similar_vendors!.category_id, filters: { date: booking.similar_vendors!.date } }, initial: false })}
                accessibilityRole="button"
              >
                <Text style={s.link}>See all vendors free on your date</Text>
              </Pressable>
            </Card>
          )}
          {invoiceAvailable(booking) && <InvoiceButton bookingId={booking.id} />}

          <RentalReturnCard booking={booking} role="CUSTOMER" onDone={load} />

          <PaymentTimeline key={paymentsKey} bookingId={booking.id} bookingStatus={booking.status} startReporting={reporting} onChanged={() => { load(); extras.reload(); }} />

          <BookingContractCard bookingId={booking.id} role="CUSTOMER" bookingStatus={booking.status} />

          {proofs.length > 0 && (
            <Card>
              <Text style={s.h2}>Photo Proof</Text>
              {proofs.map((p) => (
                <View key={p.id} style={{ gap: 8 }}>
                  <Text style={s.muted}>{format(parseISO(p.created_at), 'MMM d, yyyy')}</Text>
                  {!!p.notes && <Text style={s.body}>{p.notes}</Text>}
                  <View style={s.photoRow}>
                    {p.photos.map((url, i) => (
                      <Pressable key={i} onPress={() => Linking.openURL(url)}>
                        <Image source={{ uri: url }} style={s.thumb} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {deliverables.length > 0 && (
            <Card>
              <Text style={s.h2}>Deliverables</Text>
              {deliverables.map((d) => (
                <View key={d.id} style={{ gap: 4 }}>
                  <Text style={s.body}>{d.title}</Text>
                  <Text style={s.muted}>{format(parseISO(d.created_at), 'MMM d, yyyy')}</Text>
                  {!!d.message && <Text style={s.body}>{d.message}</Text>}
                  {[...d.links, ...d.files].map((url, i) => (
                    <Pressable key={i} onPress={() => Linking.openURL(url)}>
                      <Text style={s.link} numberOfLines={1}>{i < d.links.length ? url : `File ${i - d.links.length + 1}`}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </Card>
          )}

          {st === 'COMPLETED' && (
            <Card style={{ alignItems: 'center', gap: 12, borderWidth: 1, borderColor: DARK.field }}>
              {/* one review per booking: once it's there (now or earlier), no form */}
              {reviewed || booking.review ? (
                <>
                  <Ionicons name="heart" size={32} color={DARK.accent} />
                  <Text style={s.h2}>Thanks for your review!</Text>
                  {!!booking.review?.rating && (
                    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`You rated it ${booking.review.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons key={i} name="star" size={18} color={i <= booking.review!.rating ? '#F28C28' : DARK.field} />
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={s.h2}>How was your experience?</Text>
                  <Text style={s.muted}>Your feedback helps {vendor} and other customers</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginVertical: 4 }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Pressable key={i} onPress={() => setRating(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}>
                        <Ionicons name="star" size={36} color={i <= rating ? '#F28C28' : '#fff'} />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={s.reviewInput}
                    placeholder="Write a quick review (optional)..."
                    placeholderTextColor={DARK.muted}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                  />
                  <GradientButton title="Send review" onPress={submitReview} loading={busy} style={{ alignSelf: 'stretch' }} />
                </>
              )}
            </Card>
          )}
        </View>
      </ScrollView>

      {(st === 'PENDING' || st === 'CONFIRMED' || st === 'COMPLETED') && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
          {st === 'PENDING' && (
            <Pressable style={s.outline} onPress={cancel} disabled={busy} accessibilityRole="button">
              <Text style={s.outlineText}>Cancel Request</Text>
            </Pressable>
          )}
          {st === 'CONFIRMED' && !paid && !booking.payment_plan && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={[s.outline, { flex: 1 }]} onPress={cancel} disabled={busy} accessibilityRole="button">
                <Text style={s.outlineText}>Cancel</Text>
              </Pressable>
              <GradientButton title={`Pay ${money(total)}`} onPress={payNow} loading={busy} style={{ flex: 2 }} />
            </View>
          )}
          {st === 'CONFIRMED' && (paid || !!booking.payment_plan) && (
            <Pressable style={s.outline} onPress={cancel} disabled={busy} accessibilityRole="button">
              <Text style={s.outlineText}>Cancel booking</Text>
            </Pressable>
          )}
          {st === 'COMPLETED' && booking.listing?.id && (
            <GradientButton title="Book Again" onPress={() => nav.navigate('HomeTab', { screen: 'ListingDetail', params: { listingId: booking.listing.id }, initial: false })} />
          )}
        </View>
      )}
    </View>
  );
}

function Row({ icon, label, value, bold }: { icon?: keyof typeof Ionicons.glyphMap; label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.detailRow}>
      <View style={[s.meta, { flexShrink: 0 }]}>
        {icon && <Ionicons name={icon} size={20} color={DARK.muted} />}
        <Text style={[s.rowLabel, bold && s.rowBold]}>{label}</Text>
      </View>
      <Text style={[s.rowValue, bold && s.rowBold]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  ring: { width: 116, height: 116, borderRadius: 58, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ringInner: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold, textAlign: 'center' },
  heroBody: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontFamily: FONTS.semibold },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular, textAlign: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  msgBtn: { height: 50, borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  msgText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  rowLabel: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.regular },
  // the value keeps its own width (amounts never get squeezed); a long label wraps instead
  rowValue: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium, flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  rowBold: { color: '#fff', fontFamily: FONTS.semibold, fontSize: 16 },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: DARK.field, marginVertical: 4 },
  line: { height: 1, backgroundColor: DARK.field },
  paidNote: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: DARK.field },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  reviewInput: { alignSelf: 'stretch', minHeight: 110, borderRadius: 16, backgroundColor: DARK.field, padding: 14, color: '#fff', fontSize: 15, fontFamily: FONTS.regular, textAlignVertical: 'top' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg },
  outline: { height: 56, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
});
