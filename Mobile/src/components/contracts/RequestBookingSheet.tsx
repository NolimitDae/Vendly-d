import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { BookingService } from '../../services/booking.service';
import {
  BookingFields,
  ContractsService,
  SignaturePayload,
  apiError,
  deviceTimezone,
} from '../../services/contracts.service';
import SignContractView from './SignContractView';

interface Props {
  visible: boolean;
  listing: { id: string; title: string; vendorId: string };
  eventId?: string;
  onClose: () => void;
  onCreated: (bookingId: string) => void;
}

interface Preview {
  title: string;
  body: string;
  content_sha256: string;
  preview_token: string;
  source_pdf_url: string | null;
  consent_text: string;
  missing_message: string | null;
}

type Picker = null | 'date' | 'start' | 'end';

function combine(date: Date, time: Date | null) {
  const d = new Date(date);
  if (time) d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d;
}

/** Event details → contract review → sign & send. */
export default function RequestBookingSheet({ visible, listing, eventId, onClose, onCreated }: Props) {
  const [date, setDate] = useState<Date | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [venue, setVenue] = useState('');
  const [guests, setGuests] = useState('');
  const [comments, setComments] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = (): BookingFields => {
    const startAt = date && start ? combine(date, start) : null;
    let endAt = date && end ? combine(date, end) : null;
    if (startAt && endAt && endAt <= startAt) endAt = new Date(endAt.getTime() + 86400e3);
    return {
      listing_id: listing.id,
      vendor_id: listing.vendorId,
      scheduled_at: date ? (startAt ?? combine(date, null)).toISOString() : undefined,
      event_start_at: startAt?.toISOString(),
      event_end_at: endAt?.toISOString(),
      venue_address: venue.trim() || undefined,
      guest_count: guests ? Number(guests) : undefined,
      message: comments.trim() || undefined,
      event_id: eventId,
      timezone: deviceTimezone(),
    };
  };

  const reviewContract = async () => {
    if (!date) return Alert.alert('Event date', 'Choose the event date.');
    setBusy(true);
    try {
      const res = await ContractsService.bookingPreview(fields());
      const data: Preview = res.data.data;
      if (data.missing_message) return Alert.alert('More details needed', data.missing_message);
      setPreview(data);
    } catch (err) {
      Alert.alert('Error', apiError(err, "Couldn't load the contract"));
    } finally {
      setBusy(false);
    }
  };

  const signAndSend = async (signature: SignaturePayload) => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await BookingService.createBooking({ ...fields(), preview_token: preview.preview_token, signature });
      setPreview(null);
      onCreated(res.data.data.id);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        Alert.alert('Contract updated', 'The contract changed. Please review it again.');
        setPreview(null);
        await reviewContract();
      } else {
        Alert.alert('Error', apiError(err, 'Failed to send the booking request'));
      }
    } finally {
      setBusy(false);
    }
  };

  const pickerValue = picker === 'date' ? date : picker === 'start' ? start : end;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={preview ? () => setPreview(null) : onClose}>
      {preview ? (
        <SignContractView
          title={preview.title}
          body={preview.body}
          contentSha256={preview.content_sha256}
          consentText={preview.consent_text}
          sourcePdfUrl={preview.source_pdf_url}
          submitLabel="Sign & send request"
          busy={busy}
          onSubmit={signAndSend}
          onCancel={() => setPreview(null)}
        />
      ) : (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text style={s.headerTitle} numberOfLines={1}>Request Booking</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.listing}>{listing.title}</Text>

            <Text style={s.label}>Event date</Text>
            <TouchableOpacity style={s.input} onPress={() => setPicker('date')}>
              <Text style={date ? s.value : s.placeholder}>{date ? format(date, 'EEEE, MMMM d, yyyy') : 'Select date'}</Text>
            </TouchableOpacity>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Start time</Text>
                <TouchableOpacity style={s.input} onPress={() => setPicker('start')}>
                  <Text style={start ? s.value : s.placeholder}>{start ? format(start, 'h:mm a') : 'Start'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>End time</Text>
                <TouchableOpacity style={s.input} onPress={() => setPicker('end')}>
                  <Text style={end ? s.value : s.placeholder}>{end ? format(end, 'h:mm a') : 'End'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {picker && (
              <DateTimePicker
                value={pickerValue ?? new Date()}
                mode={picker === 'date' ? 'date' : 'time'}
                minimumDate={picker === 'date' ? new Date() : undefined}
                onChange={(_, selected) => {
                  if (Platform.OS !== 'ios') setPicker(null);
                  if (!selected) return;
                  if (picker === 'date') setDate(selected);
                  else if (picker === 'start') setStart(selected);
                  else setEnd(selected);
                }}
              />
            )}
            {Platform.OS === 'ios' && picker && (
              <TouchableOpacity style={s.done} onPress={() => setPicker(null)}>
                <Text style={s.doneText}>Done</Text>
              </TouchableOpacity>
            )}

            <Text style={s.label}>Venue address{eventId ? " (defaults to your event's venue)" : ''}</Text>
            <TextInput style={s.input} value={venue} onChangeText={setVenue} placeholder="Where is the event?" placeholderTextColor={COLORS.gray[400]} />

            <Text style={s.label}>Guest count</Text>
            <TextInput
              style={s.input}
              value={guests}
              onChangeText={(t) => setGuests(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="e.g. 120"
              placeholderTextColor={COLORS.gray[400]}
            />

            <Text style={s.label}>Booking comments (allergies, special requests)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={comments}
              onChangeText={setComments}
              multiline
              textAlignVertical="top"
              placeholder="These are included in the contract."
              placeholderTextColor={COLORS.gray[400]}
            />

            <Text style={s.note}>Next you&apos;ll review and sign the vendor&apos;s contract. Nothing is charged until you pay.</Text>

            <TouchableOpacity style={[s.primary, busy && { opacity: 0.6 }]} onPress={reviewContract} disabled={busy}>
              {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryText}>Review contract</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.gray[900] },
  body: { padding: 20, gap: 8, paddingBottom: 48 },
  listing: { fontSize: 18, fontWeight: '800', color: COLORS.gray[900], marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600], marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.gray[900], backgroundColor: COLORS.gray[50],
  },
  textarea: { height: 100 },
  value: { fontSize: 15, color: COLORS.gray[900] },
  placeholder: { fontSize: 15, color: COLORS.gray[400] },
  row: { flexDirection: 'row', gap: 12 },
  done: { alignSelf: 'flex-end', padding: 8 },
  doneText: { color: COLORS.primary, fontWeight: '700' },
  note: { fontSize: 12, color: COLORS.gray[500], marginTop: 12 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});
