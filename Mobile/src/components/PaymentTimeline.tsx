import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import AddCardSheet from './AddCardSheet';
import AddBankSheet from './AddBankSheet';
import { Card, GradientButton } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { BANK_CLEARING_TEXT, isBankAccount, PaymentsService, PLAN_LABELS, type Installment, type PaymentTimeline as Timeline, type SavedCard } from '../services/payments.service';
import { apiMessage } from '../screens/auth/SignIn';
import ReportProblemForm from './ReportProblemForm';
import DisputeDetails from './DisputeDetails';
import { dueByText, PAYMENT_STATE_LABELS } from '../utils/bookingStatus';
import { BookingService, type Booking } from '../services/booking.service';

const money = (n: number) => `$${Number(n).toFixed(2)}`;

const STATUS: Record<Installment['status'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  SCHEDULED: { label: 'Scheduled', color: DARK.muted, icon: 'time-outline' },
  PROCESSING: { label: 'Card held', color: '#fcd34d', icon: 'lock-closed-outline' },
  PAID: { label: 'Paid', color: '#6ee7c7', icon: 'checkmark-circle-outline' },
  FAILED: { label: 'Payment failed', color: '#fca5a5', icon: 'alert-circle-outline' },
  CANCELLED: { label: 'Cancelled', color: DARK.muted, icon: 'close-circle-outline' },
  REFUNDED: { label: 'Refunded', color: DARK.accent, icon: 'return-down-back-outline' },
};
/** A bank payment on its way (large bookings): not paid yet, not failed. */
const CLEARING = { label: 'Processing', color: '#fcd34d', icon: 'business-outline' as keyof typeof Ionicons.glyphMap };

/**
 * The customer's view of a booking's money: plan, each charge, what is held, and the actions
 * that move it (retry a failed charge, confirm the work, report a problem). `startReporting`
 * opens the report form straight away (from the cancel prompt's no-show hint).
 */
export default function PaymentTimeline({ bookingId, bookingStatus, onChanged, startReporting }: { bookingId: string; bookingStatus: string; onChanged?: () => void; startReporting?: boolean }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [bankFor, setBankFor] = useState<string | null>(null);
  // saved bank accounts, for a large booking's missed payment
  const [banks, setBanks] = useState<SavedCard[]>([]);
  const [disputing, setDisputing] = useState(!!startReporting);

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
  useEffect(() => {
    if (!t?.bank_allowed) return;
    PaymentsService.cards({ bank: true })
      .then((r) => setBanks((r.data?.data ?? []).filter(isBankAccount)))
      .catch(() => {});
  }, [t?.bank_allowed]);

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err: any) {
      // already going through (the automatic retry got there first): not a failure, and the reload shows it
      if (err?.response?.status === 409) {
        Alert.alert('Payment in progress', apiMessage(err, 'A payment is already going through.'));
        await load();
      } else Alert.alert(fail, apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator color={DARK.accent} />;
  if (!t) return null;

  const canApprove = bookingStatus === 'COMPLETED' && !t.customer_approved_at && !t.released_at && !t.dispute;
  // the API says when (it also allows a confirmed booking past its start: a no-show); older APIs don't
  const canDispute = t.can_dispute ?? (['IN_PROGRESS', 'COMPLETED'].includes(bookingStatus) && !t.released_at && !t.dispute);
  // paid in one go through Checkout: no plan to show, only the report
  const hasPlan = t.installments.length > 0;
  if (!hasPlan && !canDispute && !t.dispute) return null;

  return (
    <Card style={{ gap: 14, borderWidth: 1, borderColor: DARK.field }}>
      <Text style={s.h2}>Payments</Text>
      {t.plan && <Text style={s.muted}>{PLAN_LABELS[t.plan]}</Text>}
      {!!t.payment_state && !!t.payment_due_by && (
        <View style={s.note}>
          <Ionicons name="alarm-outline" size={16} color="#fcd34d" />
          <Text style={s.noteText}>{PAYMENT_STATE_LABELS[t.payment_state]}: pay by {dueByText(t.payment_due_by)}, or the booking is cancelled.</Text>
        </View>
      )}

      {hasPlan && t.installments.map((i) => {
        const st = i.clearing ? CLEARING : STATUS[i.status];
        // a failed charge, or a missed deposit or balance waiting for its automatic retry: the customer can pay now
        const payable = i.status === 'FAILED' || (!!t.payment_state && i.status === 'SCHEDULED' && i.attempts > 0);
        return (
          <View key={i.id} style={s.row}>
            <Ionicons name={st.icon} size={22} color={st.color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.label}>{i.label}</Text>
              <Text style={[s.sub, { color: st.color }]}>
                {st.label}
                {i.clearing ? ` · bank payment, clears in ${BANK_CLEARING_TEXT}` : ''}
                {i.status === 'PAID' && i.paid_at ? ` · ${format(parseISO(i.paid_at), 'dd MMM')}` : ''}
                {i.status === 'SCHEDULED' && i.attempts === 0 ? ` · due ${format(parseISO(i.due_at), 'dd MMM yyyy')}` : ''}
                {i.status === 'SCHEDULED' && i.attempts > 0 && i.next_attempt_at ? ` · retrying ${format(parseISO(i.next_attempt_at), 'dd MMM, h:mm a')}` : ''}
                {i.refunded_amount > 0 ? ` · ${money(i.refunded_amount)} refunded` : ''}
              </Text>
              {!!i.last_error && i.status !== 'PAID' && <Text style={s.error}>{i.last_error}</Text>}
              {payable && (
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                  <Pressable onPress={() => run(() => PaymentsService.retry(bookingId, i.id), 'Payment failed again')} disabled={busy} hitSlop={8}>
                    <Text style={s.link}>{t.payment_state ? `Pay ${money(i.amount)} now` : 'Try again'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setAddingFor(i.id)} disabled={busy} hitSlop={8}>
                    <Text style={s.link}>Use another card</Text>
                  </Pressable>
                </View>
              )}
              {payable && t.bank_allowed && (
                <View style={{ gap: 8, marginTop: 6 }}>
                  {banks.map((b) => (
                    <Pressable key={b.id} onPress={() => run(() => PaymentsService.retry(bookingId, i.id, b.id), 'Payment failed again')} disabled={busy} hitSlop={8}>
                      <Text style={s.link}>Pay from Bank account •••• {b.last4}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setBankFor(i.id)} disabled={busy} hitSlop={8}>
                    <Text style={s.link}>{banks.length ? 'Use another bank account' : 'Pay from a bank account'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <Text style={s.amount}>{money(i.amount)}</Text>
          </View>
        );
      })}

      {hasPlan && (
        <>
          <View style={s.line} />
          <View style={s.totals}>
            <Text style={s.muted}>Paid {money(t.paid)} of {money(t.total)}</Text>
            {t.outstanding > 0 && <Text style={s.muted}>{money(t.outstanding)} to go</Text>}
          </View>
        </>
      )}
      {Number(t.processing ?? 0) > 0 && (
        <View style={s.note}>
          <Ionicons name="business-outline" size={16} color="#fcd34d" />
          <Text style={s.noteText}>Your bank payment of {money(Number(t.processing))} is processing. Bank payments take {BANK_CLEARING_TEXT} to clear; the vendor is paid only once it has. If it doesn't go through, we'll let you know so you can pay another way.</Text>
        </View>
      )}
      {Number(t.given_back ?? 0) > 0 && (
        <View style={s.note}>
          <Ionicons name="gift-outline" size={16} color="#6ee7c7" />
          <Text style={s.noteText}>Your vendor gave you {money(Number(t.given_back))} back on this booking.</Text>
        </View>
      )}

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
      {canDispute && t.not_started && (
        <View style={s.note}>
          <Ionicons name="alert-circle-outline" size={16} color="#fcd34d" />
          <Text style={s.noteText}>The start time has passed and the vendor hasn’t started. If they didn’t show up, report a problem: your payment stays held while Vendly sorts it out.</Text>
        </View>
      )}

      {canApprove && (
        <GradientButton title="Confirm work was done" onPress={() => Alert.alert('Confirm and pay the vendor?', 'Only confirm once you are happy with the service.', [{ text: 'Not yet', style: 'cancel' }, { text: 'Confirm', onPress: () => run(() => PaymentsService.approve(bookingId), 'Could not confirm') }])} loading={busy} />
      )}
      {canDispute && !disputing && (
        <Pressable onPress={() => setDisputing(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={s.link}>Report a problem</Text>
        </Pressable>
      )}
      {disputing && canDispute && (
        <ReportProblemForm
          bookingId={bookingId}
          paid={t.paid}
          limit={t.vendor_paid}
          category={t.not_started ? 'no_show' : undefined}
          onCancel={() => setDisputing(false)}
          onSent={() => {
            setDisputing(false);
            Alert.alert('Sent to Vendly', 'The vendor isn’t paid until Vendly resolves it.');
            load();
            onChanged?.();
          }}
        />
      )}
      {!!t.dispute && <YourReport bookingId={bookingId} />}

      <AddBankSheet
        visible={!!bankFor}
        onClose={() => setBankFor(null)}
        onSaved={(pm) => { const id = bankFor!; setBankFor(null); run(() => PaymentsService.retry(bookingId, id, pm), 'Payment failed again'); }}
      />
      <AddCardSheet
        visible={!!addingFor}
        onClose={() => setAddingFor(null)}
        onSaved={(pm) => { const id = addingFor!; setAddingFor(null); run(() => PaymentsService.retry(bookingId, id, pm), 'Payment failed again'); }}
      />
    </Card>
  );
}

/** What the customer reported: kind of problem, what they asked for and their photos. */
function YourReport({ bookingId }: { bookingId: string }) {
  const [b, setB] = useState<Booking | null>(null);
  useEffect(() => {
    let live = true;
    BookingService.getBooking(bookingId)
      .then((res) => live && setB(res.data?.data ?? null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [bookingId]);
  if (!b?.dispute_reason) return null;
  return (
    <View style={s.report}>
      <Text style={s.reportTitle}>Your report</Text>
      <Text style={s.noteText}>{b.dispute_reason}</Text>
      <DisputeDetails d={b} mine />
    </View>
  );
}

const s = StyleSheet.create({
  report: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: DARK.field },
  reportTitle: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.semibold },
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
});
