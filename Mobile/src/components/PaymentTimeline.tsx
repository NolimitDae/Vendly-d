import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import AddCardSheet from './AddCardSheet';
import { Card, GradientButton, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { PaymentsService, PLAN_LABELS, type Installment, type PaymentTimeline as Timeline } from '../services/payments.service';
import { apiMessage } from '../screens/auth/SignIn';

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const STATUS: Record<Installment['status'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  SCHEDULED: { label: 'Scheduled', color: DARK.muted, icon: 'time-outline' },
  PROCESSING: { label: 'Card held', color: '#fcd34d', icon: 'lock-closed-outline' },
  PAID: { label: 'Paid', color: '#6ee7c7', icon: 'checkmark-circle-outline' },
  FAILED: { label: 'Payment failed', color: '#fca5a5', icon: 'alert-circle-outline' },
  CANCELLED: { label: 'Cancelled', color: DARK.muted, icon: 'close-circle-outline' },
  REFUNDED: { label: 'Refunded', color: DARK.accent, icon: 'return-down-back-outline' },
};

/**
 * The customer's view of a booking's money: plan, each charge, what is held, and the actions
 * that move it (retry a failed charge, confirm the work, report a problem).
 */
export default function PaymentTimeline({ bookingId, bookingStatus, onChanged }: { bookingId: string; bookingStatus: string; onChanged?: () => void }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await PaymentsService.timeline(bookingId);
      setT(res.data?.data ?? null);
    } catch {
      setT(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      Alert.alert(fail, apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} />;
  if (!t || t.installments.length === 0) return null;

  const canApprove = bookingStatus === 'COMPLETED' && !t.customer_approved_at && !t.released_at && !t.dispute;
  const canDispute = ['IN_PROGRESS', 'COMPLETED'].includes(bookingStatus) && !t.released_at && !t.dispute;

  return (
    <Card style={{ gap: 14, borderWidth: 1, borderColor: DARK.field }}>
      <Text style={s.h2}>Payments</Text>
      {t.plan && <Text style={s.muted}>{PLAN_LABELS[t.plan]}</Text>}

      {t.installments.map((i) => {
        const st = STATUS[i.status];
        return (
          <View key={i.id} style={s.row}>
            <Ionicons name={st.icon} size={22} color={st.color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.label}>{i.label}</Text>
              <Text style={[s.sub, { color: st.color }]}>
                {st.label}
                {i.status === 'PAID' && i.paid_at ? ` · ${format(parseISO(i.paid_at), 'dd MMM')}` : ''}
                {i.status === 'SCHEDULED' && i.attempts === 0 ? ` · due ${format(parseISO(i.due_at), 'dd MMM yyyy')}` : ''}
                {i.status === 'SCHEDULED' && i.attempts > 0 && i.next_attempt_at ? ` · retrying ${format(parseISO(i.next_attempt_at), 'dd MMM, h:mm a')}` : ''}
                {i.refunded_amount > 0 ? ` · ${money(i.refunded_amount)} refunded` : ''}
              </Text>
              {!!i.last_error && i.status !== 'PAID' && <Text style={s.error}>{i.last_error}</Text>}
              {i.status === 'FAILED' && (
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                  <Pressable onPress={() => run(() => PaymentsService.retry(bookingId, i.id), 'Payment failed again')} disabled={busy} hitSlop={8}>
                    <Text style={s.link}>Try again</Text>
                  </Pressable>
                  <Pressable onPress={() => setAddingFor(i.id)} disabled={busy} hitSlop={8}>
                    <Text style={s.link}>Use another card</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <Text style={s.amount}>{money(i.amount)}</Text>
          </View>
        );
      })}

      <View style={s.line} />
      <View style={s.totals}>
        <Text style={s.muted}>Paid {money(t.paid)} of {money(t.total)}</Text>
        {t.outstanding > 0 && <Text style={s.muted}>{money(t.outstanding)} to go</Text>}
      </View>

      {t.dispute && !t.dispute.resolved_at ? (
        <View style={s.note}>
          <Ionicons name="shield-outline" size={16} color="#fcd34d" />
          <Text style={s.noteText}>You reported a problem on {format(parseISO(t.dispute.opened_at), 'dd MMM')}. The vendor isn't paid until Vendly resolves it.</Text>
        </View>
      ) : t.released_at ? (
        <View style={s.note}>
          <Ionicons name="checkmark-done-outline" size={16} color="#6ee7c7" />
          <Text style={s.noteText}>Paid to the vendor on {format(parseISO(t.released_at), 'dd MMM yyyy')}.</Text>
        </View>
      ) : t.release_at ? (
        <View style={s.note}>
          <Ionicons name="shield-checkmark-outline" size={16} color={DARK.accent} />
          <Text style={s.noteText}>Vendly holds the money until {format(parseISO(t.release_at), 'dd MMM, h:mm a')}. Confirm the work to pay the vendor sooner, or report a problem before then.</Text>
        </View>
      ) : t.paid > 0 ? (
        <View style={s.note}>
          <Ionicons name="shield-checkmark-outline" size={16} color={DARK.accent} />
          <Text style={s.noteText}>Vendly holds your payment until the service is done.</Text>
        </View>
      ) : null}

      {canApprove && (
        <GradientButton title="Confirm work was done" onPress={() => Alert.alert('Confirm and pay the vendor?', 'Only confirm once you are happy with the service.', [{ text: 'Not yet', style: 'cancel' }, { text: 'Confirm', onPress: () => run(() => PaymentsService.approve(bookingId), 'Could not confirm') }])} loading={busy} />
      )}
      {canDispute && !disputing && (
        <Pressable onPress={() => setDisputing(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={s.link}>Report a problem</Text>
        </Pressable>
      )}
      {disputing && (
        <View style={{ gap: 10 }}>
          <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
            <TextInput style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="What went wrong? (at least 10 characters)" placeholderTextColor={DARK.muted} value={reason} onChangeText={setReason} multiline />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={s.outline} onPress={() => setDisputing(false)}><Text style={s.outlineText}>Cancel</Text></Pressable>
            <GradientButton title="Send report" onPress={() => run(async () => { await PaymentsService.dispute(bookingId, reason.trim()); setDisputing(false); }, 'Could not send')} loading={busy} disabled={reason.trim().length < 10} style={{ flex: 1.3 }} />
          </View>
        </View>
      )}

      <AddCardSheet
        visible={!!addingFor}
        onClose={() => setAddingFor(null)}
        onSaved={(pm) => { const id = addingFor!; setAddingFor(null); run(() => PaymentsService.retry(bookingId, id, pm), 'Payment failed again'); }}
      />
    </Card>
  );
}

const s = StyleSheet.create({
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  sub: { fontSize: 12, fontFamily: FONTS.medium },
  error: { color: '#fca5a5', fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  amount: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  line: { height: 1, backgroundColor: DARK.field },
  totals: { flexDirection: 'row', justifyContent: 'space-between' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  outline: { flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: DARK.accent, fontSize: 16, fontFamily: FONTS.medium },
});
