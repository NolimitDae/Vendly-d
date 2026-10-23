import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader, ui } from '../../components/brand';
import BookingContractCard from '../../components/contracts/BookingContractCard';
import { DARK, FONTS } from '../../constants/colors';
import { openChatWith } from '../../navigation/openChat';
import { BookingService, type Booking } from '../../services/booking.service';
import { PaymentsService } from '../../services/payments.service';
import RentalReturnCard from '../../components/RentalReturnCard';
import type { VendorBookingsStackParams } from '../../navigation/types';
import { bookingWhen } from '../customer/Bookings';
import { closesIn } from '../../utils/requests';

interface Proof { id: string; photos: string[]; notes?: string; created_at: string }
interface Deliverable { id: string; title: string; message?: string; files: string[]; links: string[]; created_at: string }

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

export default function VendorBookingDetail() {
  const { bookingId } = useRoute<RouteProp<VendorBookingsStackParams, 'VendorBookingDetail'>>().params;
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [proofPhotos, setProofPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [proofNotes, setProofNotes] = useState('');
  const [proofStamps, setProofStamps] = useState<string[]>([]);
  const [delivTitle, setDelivTitle] = useState('');
  const [delivMsg, setDelivMsg] = useState('');
  const [delivLink, setDelivLink] = useState('');

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

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err: any) {
      Alert.alert(fail, err?.response?.data?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const decline = () =>
    Alert.alert('Decline this request?', 'The customer will be told you can’t take this booking.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => run(() => BookingService.rejectBooking(bookingId), 'Could not decline') },
    ]);
  const start = () => Alert.alert('Start this booking?', 'The customer will see the service is in progress.', [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Start', onPress: () => run(() => BookingService.startWork(bookingId), 'Could not start') },
  ]);
  const complete = () => Alert.alert('Mark as completed?', 'Upload proof photos first so the customer can confirm the work.', [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Complete', onPress: () => run(() => BookingService.completeBooking(bookingId), 'Could not complete') },
  ]);

  const pickProofPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
    // added to any photos already taken with the camera
    if (!res.canceled) setProofPhotos((prev) => [...prev, ...res.assets]);
  };
  // Photos taken here (not picked from the library) are stamped with the time and, if allowed,
  // where they were taken: strong evidence if the customer disputes the job.
  const takeProofPhoto = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) return Alert.alert('Camera', 'Allow camera access in Settings to take proof photos.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled) return;
    setProofPhotos((prev) => [...prev, ...res.assets]);
    const takenAt = new Date();
    let where = '';
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        where = ` near ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      }
    } catch {
      // no location: the time stamp alone still helps
    }
    setProofStamps((prev) => [...prev, `📷 Taken in Vendly ${format(takenAt, 'd MMM yyyy, HH:mm')}${where}`]);
  };
  const uploadProof = () => {
    if (!proofPhotos.length) return Alert.alert('Photos', 'Pick at least one photo of the finished work.');
    const notes = [proofNotes.trim(), ...proofStamps].filter(Boolean).join('\n');
    run(async () => {
      await BookingService.uploadProof(bookingId, proofPhotos.map((p) => ({ uri: p.uri, name: p.fileName ?? 'photo.jpg', type: p.mimeType ?? 'image/jpeg' })), notes || undefined);
      setProofPhotos([]);
      setProofNotes('');
      setProofStamps([]);
    }, 'Could not upload proof');
  };
  const sendDeliverable = () => {
    if (!delivTitle.trim()) return Alert.alert('Title', 'Give the deliverable a name.');
    run(async () => {
      await BookingService.sendDeliverable(bookingId, { title: delivTitle.trim(), message: delivMsg.trim() || undefined, links: delivLink.trim() ? [delivLink.trim()] : [] });
      setDelivTitle('');
      setDelivMsg('');
      setDelivLink('');
    }, 'Could not send deliverable');
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
  const customer = booking.customer?.name ?? 'Customer';
  const hero =
    st === 'PENDING'
      ? { title: 'New Booking Request', body: `${customer} signed the contract. Review the details, then Accept & Sign or decline.`, icon: 'document-text-outline' as const }
      : st === 'CONFIRMED' && !paid
        ? { title: 'Accepted — awaiting payment', body: `${customer} has been asked to pay. The date is locked in once they do.`, icon: 'hourglass-outline' as const }
        : st === 'CONFIRMED'
          ? { title: 'Confirmed & Paid', body: 'Vendly is holding the payment. Start the booking on the day.', icon: 'checkmark' as const }
          : st === 'IN_PROGRESS'
            ? { title: 'In Progress', body: 'Upload proof photos when the work is done, then mark it complete.', icon: 'flash-outline' as const }
            : st === 'COMPLETED'
              ? { title: 'Completed', body: paid ? 'Payment is released to your balance under the payout rules.' : 'Completed.', icon: 'checkmark' as const }
              : st === 'REJECTED'
                ? { title: 'Declined', body: 'You declined this request.', icon: 'close' as const }
                : { title: 'Cancelled', body: 'This booking was cancelled.', icon: 'close' as const };
  const total = Number(booking.amount ?? 0) + Number(booking.service_fee ?? 0);
  const startAt = booking.event_start_at ?? booking.scheduled_at;

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title={st === 'PENDING' ? 'Request Booking' : 'Booking'} onBack={() => nav.goBack()} />

        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          <Card style={s.hero}>
            <View style={s.ring}>
              <BrandGradient style={s.ringInner}>
                <Ionicons name={hero.icon} size={40} color="#fff" />
              </BrandGradient>
            </View>
            <Text style={s.heroTitle}>{hero.title}</Text>
            <Text style={s.heroBody}>{hero.body}</Text>
          </Card>

          <Card style={{ gap: 16 }}>
            <View style={s.row}>
              <View style={s.avatar}>
                {booking.customer?.avatar ? <Image source={{ uri: booking.customer.avatar }} style={StyleSheet.absoluteFill} /> : <Text style={s.avatarText}>{customer[0]?.toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h2}>{customer}</Text>
                <Text style={s.muted}>{st === 'PENDING' ? 'Pending booking' : `Booked ${booking.listing?.title ?? 'a service'}`}</Text>
              </View>
            </View>
            {booking.customer?.id && (
              <Pressable onPress={() => openChatWith(nav, booking.customer!.id, customer)} accessibilityRole="button">
                <BrandGradient style={s.msgBtn}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                  <Text style={s.msgText}>Message {customer.split(' ')[0]}</Text>
                </BrandGradient>
              </Pressable>
            )}
          </Card>

          <Card style={{ gap: 14, borderWidth: 1, borderColor: DARK.field }}>
            <Text style={s.h2}>Your Service</Text>
            {!booking.is_rental && <Row icon="cube-outline" label="Service" value={booking.listing?.title ?? '—'} />}
            {!!booking.venue_address && <Row icon="location-outline" label="Address" value={booking.venue_address} />}
            {booking.is_rental ? (
              <>
                {booking.rental_reservations?.map((r) => <Row key={r.id} icon="layers-outline" label={`${r.quantity} ×`} value={r.item.title} />)}
                {!!booking.rental_reservations?.[0] && (
                  <Row icon="calendar-outline" label="Dates" value={`${format(parseISO(booking.rental_reservations[0].start_date.slice(0, 10)), 'dd MMM')} → ${format(parseISO(booking.rental_reservations[0].end_date.slice(0, 10)), 'dd MMM yyyy')}`} />
                )}
              </>
            ) : (
              <>
                {!!startAt && <Row icon="calendar-outline" label="Date" value={format(parseISO(startAt), 'EEE, dd MMM yyyy')} />}
                {!!startAt && <Row icon="time-outline" label="Time" value={bookingWhen(booking).split('•')[1]?.trim() ?? format(parseISO(startAt), 'h:mm a')} />}
              </>
            )}
            {booking.guest_count != null && <Row icon="people-outline" label="Guests" value={String(booking.guest_count)} />}
            {!!booking.message && <Row icon="chatbox-ellipses-outline" label="Notes" value={booking.message} />}
            <View style={s.dashed} />
            <Text style={s.h2}>Price Details</Text>
            <Row label="Your price" value={money(booking.amount)} />
            <Row label="Vendly Protection fee (customer pays)" value={money(booking.service_fee)} />
            <View style={s.line} />
            <Row label="Customer total" value={money(total)} bold />
            <Row label="You receive" value={money(booking.amount)} bold />
            {Number(booking.security_deposit ?? 0) > 0 && <Row label="Security deposit (held)" value={money(booking.security_deposit)} />}
          </Card>

          <RentalReturnCard booking={booking} role="VENDOR" onDone={load} />

          {!!booking.event_bookings?.length && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(st) && (
            <Pressable style={s.eventCard} onPress={() => nav.navigate('EventShared', { eventId: booking.event_bookings![0].event.id })} accessibilityRole="button">
              <Ionicons name="sparkles-outline" size={22} color={DARK.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{booking.event_bookings[0].event.name}</Text>
                <Text style={s.muted}>Run of show, shared files and the event chat</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
            </Pressable>
          )}

          <BookingContractCard bookingId={booking.id} role="VENDOR" bookingStatus={booking.status} onChanged={load} />

          {(st === 'CONFIRMED' || st === 'IN_PROGRESS') && booking.payment_plan && booking.payment_plan.startsWith('DEPOSIT') && !Number(booking.early_released_amount ?? 0) && (
            <Card style={{ gap: 10 }}>
              <Text style={s.h2}>Need the deposit now?</Text>
              <Text style={s.muted}>You can take the paid deposit before the event, for supplies or travel. It comes off your final payout, and is taken back from future payouts if the booking is refunded.</Text>
              <Pressable
                style={s.outline}
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert('Release the deposit now?', 'It is sent to your bank through Stripe.', [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Release', onPress: () => run(() => PaymentsService.releaseDeposit(bookingId), 'Could not release the deposit') },
                  ])
                }
              >
                <Ionicons name="flash-outline" size={20} color={DARK.accent} />
                <Text style={s.outlineText}>Release deposit early</Text>
              </Pressable>
            </Card>
          )}
          {Number(booking.early_released_amount ?? 0) > 0 && (
            <Text style={s.muted}>Deposit of {money(booking.early_released_amount)} released early · it comes off your final payout.</Text>
          )}

          {(st === 'IN_PROGRESS' || st === 'CONFIRMED') && paid && !booking.is_rental && (
            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>Proof of work</Text>
              <Text style={s.muted}>Photos of the finished work protect you if there's a dispute.</Text>
              {proofPhotos.length > 0 && (
                <View style={s.photoRow}>
                  {proofPhotos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={s.thumb} />)}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable style={[s.outline, { flex: 1 }]} onPress={takeProofPhoto} accessibilityRole="button">
                  <Ionicons name="camera-outline" size={20} color={DARK.accent} />
                  <Text style={s.outlineText}>Take photo</Text>
                </Pressable>
                <Pressable style={[s.outline, { flex: 1 }]} onPress={pickProofPhotos} accessibilityRole="button">
                  <Ionicons name="images-outline" size={20} color={DARK.accent} />
                  <Text style={s.outlineText}>{proofPhotos.length ? `${proofPhotos.length} selected` : 'From library'}</Text>
                </Pressable>
              </View>
              {proofStamps.length > 0 && <Text style={s.muted}>{proofStamps.join('\n')}</Text>}
              <View style={ui.field}>
                <TextInput style={ui.input} placeholder="Notes (optional)" placeholderTextColor={DARK.muted} value={proofNotes} onChangeText={setProofNotes} />
              </View>
              <GradientButton title="Upload proof" onPress={uploadProof} loading={busy} disabled={!proofPhotos.length} />
            </Card>
          )}

          {proofs.length > 0 && (
            <Card>
              <Text style={s.h2}>Uploaded proof</Text>
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

          {(st === 'IN_PROGRESS' || st === 'COMPLETED') && !booking.is_rental && (
            <Card style={{ gap: 12 }}>
              <Text style={s.h2}>Send a deliverable</Text>
              <Text style={s.muted}>Share final files or a gallery link with {customer.split(' ')[0]}.</Text>
              <View style={ui.field}><TextInput style={ui.input} placeholder="Title, e.g. Final photos" placeholderTextColor={DARK.muted} value={delivTitle} onChangeText={setDelivTitle} /></View>
              <View style={ui.field}><TextInput style={ui.input} placeholder="Link (optional)" placeholderTextColor={DARK.muted} value={delivLink} onChangeText={setDelivLink} autoCapitalize="none" keyboardType="url" /></View>
              <View style={ui.field}><TextInput style={ui.input} placeholder="Message (optional)" placeholderTextColor={DARK.muted} value={delivMsg} onChangeText={setDelivMsg} /></View>
              <GradientButton title="Send deliverable" onPress={sendDeliverable} loading={busy} disabled={!delivTitle.trim()} />
            </Card>
          )}

          {deliverables.length > 0 && (
            <Card>
              <Text style={s.h2}>Sent deliverables</Text>
              {deliverables.map((d) => (
                <View key={d.id} style={{ gap: 4 }}>
                  <Text style={s.body}>{d.title}</Text>
                  <Text style={s.muted}>{format(parseISO(d.created_at), 'MMM d, yyyy')}</Text>
                  {[...d.links, ...d.files].map((url, i) => (
                    <Pressable key={i} onPress={() => Linking.openURL(url)}>
                      <Text style={s.link} numberOfLines={1}>{i < d.links.length ? url : `File ${i - d.links.length + 1}`}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      {(st === 'PENDING' || (st === 'CONFIRMED' && paid) || st === 'IN_PROGRESS') && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
          {st === 'PENDING' && (
            <>
              <Text style={s.footerHint}>
                Accept & Sign is in the Contract card above
                {closesIn(booking.request_expires_at) ? `. ${closesIn(booking.request_expires_at)}, then it closes on its own.` : ''}
              </Text>
              <Pressable style={s.decline} onPress={decline} disabled={busy} accessibilityRole="button">
                <Text style={s.declineText}>Decline</Text>
              </Pressable>
            </>
          )}
          {st === 'CONFIRMED' && paid && <GradientButton title="Start booking" onPress={start} loading={busy} />}
          {st === 'IN_PROGRESS' && (!booking.is_rental || booking.rental_return) && <GradientButton title="Mark as completed" onPress={complete} loading={busy} />}
          {st === 'IN_PROGRESS' && booking.is_rental && !booking.rental_return && <Text style={s.footerHint}>Check the items back in above, then complete the rental</Text>}
        </View>
      )}
    </View>
  );
}

function Row({ icon, label, value, bold }: { icon?: keyof typeof Ionicons.glyphMap; label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.detailRow}>
      <View style={[s.row, { gap: 8, flexShrink: 0, maxWidth: '55%' }]}>
        {icon && <Ionicons name={icon} size={20} color={DARK.muted} />}
        <Text style={[s.rowLabel, bold && s.rowBold]} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={[s.rowValue, bold && s.rowBold]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: DARK.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  ring: { width: 100, height: 100, borderRadius: 50, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ringInner: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 20, fontFamily: FONTS.semibold, textAlign: 'center' },
  heroBody: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  msgBtn: { height: 50, borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  msgText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  rowLabel: { color: DARK.muted, fontSize: 15, fontFamily: FONTS.regular, flexShrink: 1 },
  rowValue: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium, flex: 1, textAlign: 'right' },
  rowBold: { color: '#fff', fontFamily: FONTS.semibold, fontSize: 16 },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: DARK.field, marginVertical: 4 },
  line: { height: 1, backgroundColor: DARK.field },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 88, height: 88, borderRadius: 10, backgroundColor: DARK.field },
  outline: { height: 50, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg, gap: 10 },
  footerHint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium, textAlign: 'center' },
  decline: { height: 56, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  declineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
