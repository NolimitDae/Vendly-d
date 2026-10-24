import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Sheet from '../Sheet';
import { GradientButton, ui } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { BookingMoneyService, type CancellationSummary } from '../../services/bookingMoney.service';
import { CUSTOMER_CANCEL_REASONS, NON_PAYMENT_REASON, VENDOR_CANCEL_REASONS, type CancelReason } from '../../utils/bookingStatus';

const errorText = (err: any, fallback: string) => err?.response?.data?.message ?? fallback;

/**
 * Cancel confirmation that first shows what cancelling now does with the money
 * (GET /bookings/:id/cancel-preview), asks why (a reason from the user's list and an optional note),
 * then cancels and shows the refund result. A vendor's "Customer didn't pay" is previewed on its own:
 * it settles like a customer cancellation. Open it by passing the booking id.
 */
export default function CancelBookingSheet({
  bookingId,
  role,
  title,
  onClose,
  onCancelled,
  onReportProblem,
}: {
  /** the booking to cancel; null keeps the sheet closed */
  bookingId: string | null;
  role: 'CUSTOMER' | 'VENDOR';
  /** "Cancel this request?" for a request the vendor hasn't accepted yet */
  title?: string;
  onClose: () => void;
  onCancelled?: (summary: CancellationSummary | null) => void;
  /** offered when the start time passed and the vendor never started (maybe a no-show) */
  onReportProblem?: () => void;
}) {
  const [preview, setPreview] = useState<CancellationSummary | null>(null);
  const [reasons, setReasons] = useState<CancelReason[]>(role === 'VENDOR' ? VENDOR_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // a fresh start each time it opens
  useEffect(() => {
    setReason('');
    setNote('');
    setPreview(null);
  }, [bookingId]);

  // the money changes only with the vendor's non-payment reason, so only that one asks again
  const previewFor = reason === NON_PAYMENT_REASON ? NON_PAYMENT_REASON : undefined;
  useEffect(() => {
    if (!bookingId) return;
    let live = true;
    setLoading(true);
    BookingMoneyService.cancelPreview(bookingId, previewFor)
      .then((res) => {
        if (!live) return;
        const data = res.data?.data ?? null;
        setPreview(data);
        if (data?.reasons?.length) setReasons(data.reasons);
      })
      .catch((err: any) => {
        if (!live) return;
        // the booking can no longer be cancelled (a 400 says why); otherwise still let them cancel
        if (err?.response?.status === 400 || err?.response?.status === 403) {
          Alert.alert('Can’t cancel', errorText(err, 'This booking can’t be cancelled now.'));
          onClose();
        }
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, previewFor]);

  const confirm = async () => {
    if (!bookingId || !reason) return;
    setBusy(true);
    try {
      const res = await BookingMoneyService.cancel(bookingId, { reason_code: reason, note: note.trim() || undefined });
      const summary = res.data?.data?.refund_summary ?? null;
      onClose();
      onCancelled?.(summary);
      // the message already says how much comes back, to which card and when
      Alert.alert('Booking cancelled', summary?.message ?? 'The booking is cancelled.');
    } catch (err) {
      Alert.alert('Could not cancel', errorText(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const policy = preview?.policy && preview.cancelled_by === 'CUSTOMER' ? `${preview.policy.label} cancellation policy: ${preview.policy.text}` : null;

  return (
    <Sheet
      visible={!!bookingId}
      onClose={busy ? () => undefined : onClose}
      title={title ?? (role === 'VENDOR' ? 'Cancel this booking?' : 'Cancel your booking?')}
      footer={
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable style={s.outline} onPress={onClose} disabled={busy} accessibilityRole="button">
            <Text style={s.outlineText}>Keep it</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <GradientButton title="Cancel booking" onPress={confirm} loading={busy} disabled={!reason || loading} />
          </View>
        </View>
      }
    >
      {loading && !preview ? (
        <ActivityIndicator color={DARK.accent} />
      ) : preview ? (
        <View style={{ gap: 8 }}>
          {!!preview.report_problem_hint && !!onReportProblem && (
            <View style={s.hint}>
              <Text style={s.hintText}>{preview.report_problem_hint}</Text>
              <Pressable
                onPress={() => {
                  onClose();
                  onReportProblem();
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={s.link}>Report a problem</Text>
              </Pressable>
            </View>
          )}
          <Text style={s.message}>{preview.message}</Text>
          {!!policy && <Text style={s.muted}>{policy}</Text>}
        </View>
      ) : (
        <Text style={s.muted}>Any payment is refunded under the contract’s cancellation terms.</Text>
      )}

      <Text style={s.label}>Why are you cancelling?</Text>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        {reasons.map((r) => (
          <Pressable key={r.key} onPress={() => setReason(r.key)} style={s.radioRow} accessibilityRole="radio" accessibilityState={{ checked: reason === r.key }}>
            <Ionicons name={reason === r.key ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r.key ? DARK.accent : DARK.muted} />
            <Text style={s.radioText}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={[ui.input, { minHeight: 72, textAlignVertical: 'top' }]}
        placeholder={role === 'VENDOR' ? 'Add a note (optional, the customer sees it)' : 'Add a note (optional, the vendor sees it)'}
        placeholderTextColor={DARK.muted}
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 500))}
        multiline
        accessibilityLabel="Note"
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  message: { color: '#fff', fontSize: 15, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  label: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  radioText: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  hint: { backgroundColor: 'rgba(252,211,77,0.12)', borderRadius: 12, padding: 12, gap: 8 },
  hintText: { color: '#fcd34d', fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
