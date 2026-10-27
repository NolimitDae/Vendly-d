import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../brand';
import { BookingService } from '../../services/booking.service';
import { ContractsService, apiError, type SignaturePayload } from '../../services/contracts.service';
import { money, paymentStatusText, planError, planPayload, startingPlan, whenText, type PaymentPlanState, type PlanDraftRow, type PlanRow } from '../../utils/paymentPlan';
import SignContractView from '../contracts/SignContractView';
import PaymentPlanEditor from './PaymentPlanEditor';

interface Props {
  bookingId: string;
  role: 'VENDOR' | 'CUSTOMER';
  bookingStatus: string;
  /** the other side's name, for the messages */
  otherName: string;
  onChanged?: () => void;
}

const STATUS_COLOR: Record<string, string> = { PAID: '#86efac', FAILED: '#fca5a5', PROCESSING: '#fcd34d', REFUNDED: DARK.accent };

/** A list of payments: what, when, how much, and where each stands. */
export function PaymentRows({ rows, firstLabel }: { rows: PlanRow[]; firstLabel: string }) {
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, k) => (
        <View
          key={`${r.label}-${k}`}
          style={s.payment}
          accessible
          accessibilityLabel={`${r.label}, ${money(r.amount)}, ${whenText(r.due_at, firstLabel)}${r.status ? `, ${paymentStatusText(r.status)}` : ''}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.value}>{r.label}</Text>
            <Text style={[s.small, r.status && STATUS_COLOR[r.status] ? { color: STATUS_COLOR[r.status] } : null]}>
              {whenText(r.due_at, firstLabel)}
              {r.status ? ` · ${paymentStatusText(r.status)}` : ''}
            </Text>
          </View>
          <Text style={s.amount}>{money(r.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

/** The current payments, then the payments with the new plan (paid ones stay). */
function PlanComparison({ before, after, firstLabel }: { before: PlanRow[]; after: PlanRow[]; firstLabel: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.small}>Now</Text>
      <PaymentRows rows={before} firstLabel={firstLabel} />
      <Text style={[s.small, { color: DARK.accent }]}>With the new plan</Text>
      <PaymentRows rows={[...before.filter((r) => r.status === 'PAID' || r.status === 'REFUNDED'), ...after]} firstLabel={firstLabel} />
    </View>
  );
}

/**
 * A custom payment plan on a confirmed booking. The vendor sees the schedule and can propose a plan for
 * what's left (signed as an amendment); the customer sees the proposal, before and after, and signs to
 * agree or declines (the current payments stay).
 */
export default function PaymentPlanCard({ bookingId, role, bookingStatus, otherName, onChanged }: Props) {
  const [state, setState] = useState<PaymentPlanState | null>(null);
  const [rows, setRows] = useState<PlanDraftRow[] | null>(null);
  const [note, setNote] = useState('');
  const [review, setReview] = useState<null | { title: string; body: string; content_sha256: string; consent_text: string; source_pdf_url?: string | null }>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(bookingStatus);

  const load = useCallback(async () => {
    if (!shown) return setState(null);
    try {
      const res = await BookingService.paymentPlan(bookingId);
      setState(res.data.data);
    } catch {
      setState(null);
    }
  }, [bookingId, shown]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!shown || !state) return null;
  const p = state.proposal;
  const waiting = p?.status === 'WAITING' ? p : null;
  const done = async () => {
    setRows(null);
    setReview(null);
    setNote('');
    setDeclining(false);
    await load();
    onChanged?.();
  };
  const run = async (fn: () => Promise<unknown>, fail: string, ok?: [string, string]) => {
    setBusy(true);
    try {
      await fn();
      await done();
      if (ok) Alert.alert(ok[0], ok[1]);
    } catch (err) {
      Alert.alert(fail, apiError(err));
    } finally {
      setBusy(false);
    }
  };

  // ─── Customer ──────────────────────────────────────────────────────────────
  if (role === 'CUSTOMER') {
    if (!p) return null;
    const openSign = async () => {
      setBusy(true);
      try {
        const c = (await ContractsService.get(p.contract_id)).data.data;
        const source = c.has_source_pdf ? (await ContractsService.downloadLink(p.contract_id, 'source')).data.data.url : null;
        setReview({ title: c.title, body: c.body, content_sha256: c.content_sha256, consent_text: c.consent_text, source_pdf_url: source });
      } catch (err) {
        Alert.alert('Could not open the contract', apiError(err));
      } finally {
        setBusy(false);
      }
    };
    return (
      <View style={s.card}>
        <View style={s.titleRow}>
          <Ionicons name="calendar-outline" size={18} color={DARK.accent} />
          <Text style={s.title} accessibilityRole="header">{waiting ? `${p.vendor_name} proposed a payment plan` : 'Payment plan'}</Text>
        </View>
        {waiting ? (
          <>
            <Text style={s.muted}>
              {p.vendor_name} would like you to pay the {money(p.owed)} still owed in {p.after.length} payments, each charged on its date to your saved card. Sign to agree, or decline to keep your current payments.
            </Text>
            {!!p.note && <Text style={s.notice}>Note from {p.vendor_name}: {p.note}</Text>}
            <PlanComparison before={p.before} after={p.after} firstLabel="When you agree" />
            <Text style={s.small}>Payments you’ve made stay as they are. If you cancel, the first payment you made stays with the vendor as the deposit; the rest follows the cancellation policy.</Text>
            {declining ? (
              <View style={{ gap: 10 }}>
                <TextInput style={s.reason} value={reason} onChangeText={setReason} maxLength={500} multiline textAlignVertical="top" placeholder="A reason for the vendor (optional)" placeholderTextColor={DARK.muted} accessibilityLabel="Reason for declining" />
                <View style={s.actions}>
                  <Pressable style={s.danger} onPress={() => run(() => BookingService.declinePaymentPlan(bookingId, reason.trim() || undefined), 'Could not decline the plan')} disabled={busy} accessibilityRole="button">
                    <Text style={s.dangerText}>Decline plan</Text>
                  </Pressable>
                  <Pressable style={s.secondary} onPress={() => setDeclining(false)} accessibilityRole="button">
                    <Text style={s.secondaryText}>Back</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <GradientButton title="Review and sign" onPress={openSign} loading={busy} />
                <Pressable style={s.danger} onPress={() => setDeclining(true)} disabled={busy} accessibilityRole="button">
                  <Text style={s.dangerText}>Decline plan</Text>
                </Pressable>
              </>
            )}
          </>
        ) : (
          <Text style={s.muted}>
            {p.status === 'APPROVED'
              ? 'You agreed to the payment plan. Each payment is charged on its date; see Payments.'
              : p.status === 'DECLINED'
                ? 'You declined the payment plan. Your payments stayed as they were.'
                : `${p.vendor_name} withdrew the payment plan they proposed. Your payments stayed as they were.`}
          </Text>
        )}
        <Modal visible={!!review} animationType="slide" onRequestClose={() => setReview(null)}>
          {review && (
            <SignContractView
              title={review.title}
              body={review.body}
              contentSha256={review.content_sha256}
              consentText={review.consent_text}
              sourcePdfUrl={review.source_pdf_url}
              subtitle="Read the amendment with the payment plan, then sign to agree"
              submitLabel="Sign and agree"
              busy={busy}
              onSubmit={(signature: SignaturePayload) =>
                run(() => BookingService.approvePaymentPlan(bookingId, signature), 'Could not agree to the plan', ['Payment plan agreed', 'Each payment is charged on its date with your saved card.'])
              }
              onCancel={() => setReview(null)}
            />
          )}
        </Modal>
      </View>
    );
  }

  // ─── Vendor ────────────────────────────────────────────────────────────────
  const rules = state.rules;
  const latest = rules?.latest_due_at ?? null;
  const problem = rows && rules ? planError(rows, rules.owed, { feeOwed: rules.fee_owed, latest }) : null;
  const body = () => ({ ...planPayload(rows ?? [], rules?.event_start_at), ...(note.trim() ? { note: note.trim() } : {}) });
  const toReview = async () => {
    if (problem) return Alert.alert('Check the plan', problem);
    setBusy(true);
    try {
      const [res, mine] = await Promise.all([BookingService.previewPaymentPlan(bookingId, body()), ContractsService.vendorList().catch(() => null)]);
      const d = res.data.data;
      if (d.missing_message) return Alert.alert('More details needed', d.missing_message);
      setHasSaved(!!mine?.data?.data?.has_saved_signature);
      setReview(d);
    } catch (err) {
      Alert.alert('Could not check the plan', apiError(err));
    } finally {
      setBusy(false);
    }
  };
  const send = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.proposePaymentPlan(bookingId, body(), signature);
      await done();
      Alert.alert('Payment plan sent', `${otherName} can now review it and sign to agree, or decline.`);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setReview(null);
        Alert.alert('Something changed', 'Please check the plan again.');
      } else Alert.alert('Could not send the plan', apiError(err));
    } finally {
      setBusy(false);
    }
  };
  const withdraw = () =>
    Alert.alert('Withdraw your payment plan?', 'The current payments stay.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => run(() => BookingService.withdrawPaymentPlan(bookingId), 'Could not withdraw the plan') },
    ]);

  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Ionicons name="calendar-outline" size={18} color={DARK.accent} />
        <Text style={s.title} accessibilityRole="header">Payment schedule</Text>
      </View>
      {state.payments.length ? <PaymentRows rows={state.payments} firstLabel="When accepted" /> : <Text style={s.muted}>This booking was paid in one go.</Text>}
      {waiting && (
        <>
          <Text style={s.notice}>Your payment plan is waiting for {otherName}. Until they sign it, the payments above stay as they are.</Text>
          <PlanComparison before={waiting.before} after={waiting.after} firstLabel="When they agree" />
          <Pressable style={s.secondary} onPress={withdraw} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={DARK.accent} /> : <Text style={s.secondaryText}>Withdraw plan</Text>}
          </Pressable>
        </>
      )}
      {p?.status === 'DECLINED' && <Text style={s.muted}>{otherName} declined your payment plan. The payments stayed as they were.</Text>}
      {p?.status === 'APPROVED' && <Text style={s.muted}>{otherName} agreed to your payment plan. Each payment is charged on its date.</Text>}
      {state.can_propose && rules && (
        <>
          <Text style={s.muted}>{money(rules.owed)} is still to be paid. You can offer {otherName} a plan that splits it into payments on dates you choose; they sign to agree.</Text>
          <Pressable style={s.secondary} onPress={() => setRows(startingPlan(rules.owed, rules.event_start_at))} accessibilityRole="button">
            <Text style={s.secondaryText}>Propose a payment plan</Text>
          </Pressable>
        </>
      )}

      <Modal visible={!!rows} animationType="slide" onRequestClose={review ? () => setReview(null) : () => setRows(null)}>
        {review ? (
          <SignContractView
            title={review.title}
            body={review.body}
            contentSha256={review.content_sha256}
            consentText={review.consent_text}
            vendor={{ hasSavedSignature: hasSaved }}
            subtitle={`Sign the amendment with the new plan. ${otherName} reviews it and signs to agree, or declines.`}
            submitLabel="Sign and send"
            busy={busy}
            onSubmit={send}
            onCancel={() => setReview(null)}
          />
        ) : (
          rows &&
          rules && (
            <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.header}>
                <TouchableOpacity onPress={() => setRows(null)} accessibilityLabel="Close" hitSlop={12} style={s.close}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={s.sheetTitle}>Payment plan</Text>
                <View style={{ width: 48 }} />
              </View>
              <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                <Text style={s.muted}>Split the {money(rules.owed)} still owed into payments. Paid payments stay as they are.</Text>
                <PaymentPlanEditor rows={rows} onChange={setRows} total={rules.owed} feeOwed={rules.fee_owed} firstLabel="When they agree" latest={latest} />
                <Text style={s.small}>Note to {otherName} (optional)</Text>
                <TextInput style={s.reason} value={note} onChangeText={setNote} maxLength={1000} multiline textAlignVertical="top" placeholderTextColor={DARK.muted} accessibilityLabel={`Note to ${otherName}`} />
                {!!problem && <Text style={s.warn}>{problem}</Text>}
                <GradientButton title="Review and sign" onPress={toReview} loading={busy} disabled={!!problem} />
              </ScrollView>
            </KeyboardAvoidingView>
          )
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 16, fontFamily: FONTS.semibold, color: '#fff' },
  muted: { fontSize: 13, lineHeight: 19, color: DARK.muted, fontFamily: FONTS.regular },
  small: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.medium },
  value: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  amount: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notice: { fontSize: 13, color: '#fff', backgroundColor: DARK.field, padding: 12, borderRadius: 12, fontFamily: FONTS.medium, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondary: { height: 48, borderWidth: 1, borderColor: DARK.border, borderRadius: 100, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: DARK.accent, fontFamily: FONTS.medium, fontSize: 15 },
  danger: { height: 48, borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 100, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: '#fca5a5', fontFamily: FONTS.medium, fontSize: 15 },
  reason: { minHeight: 80, borderRadius: 16, backgroundColor: DARK.field, padding: 14, color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  warn: { color: '#fcd34d', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  root: { flex: 1, backgroundColor: DARK.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { padding: 20, paddingBottom: 56, gap: 12 },
});
