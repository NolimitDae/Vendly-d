import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton, ui } from '../brand';
import { BookingService } from '../../services/booking.service';
import { ContractsService, apiError, type SignaturePayload } from '../../services/contracts.service';
import {
  countsQuantity,
  draftError,
  draftFrom,
  draftPayload,
  lineFor,
  MAX_NOTE,
  money,
  moveStart,
  setEnd,
  unitWord,
  type ChangesEditor,
  type Comparison,
  type Draft,
} from '../../utils/requestChanges';
import CustomizationPicker from './CustomizationPicker';
import ChangesComparison from './ChangesComparison';
import SignContractView from '../contracts/SignContractView';
import PaymentPlanEditor from './PaymentPlanEditor';
import { addDays, parseISO } from 'date-fns';
import { planError, planPayload, startingPlan, type PlanDraftRow } from '../../utils/paymentPlan';
import { PLAN_LABELS, type PaymentPlan } from '../../services/payments.service';

interface Review extends Comparison {
  title: string;
  body: string;
  content_sha256: string;
  consent_text: string;
  missing_message: string | null;
}

type Picker = null | 'date' | 'start' | 'endDate' | 'end';

/** `day` with the time of `time` (or midnight). */
function withTime(day: Date, time: Date | null) {
  const d = new Date(day);
  d.setHours(time?.getHours() ?? 0, time?.getMinutes() ?? 0, 0, 0);
  return d;
}

/**
 * The vendor's editor for a request: date and time, guests, add-ons and fees (quantity and a price per
 * line for this booking), customizations and a note. Review shows the server's new total and the updated
 * contract, which the vendor signs to send it to the customer.
 */
export default function SuggestChangesSheet({ visible, bookingId, editor, customerName, onClose, onSent }: {
  visible: boolean;
  bookingId: string;
  editor: ChangesEditor;
  customerName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const initial = useMemo(() => draftFrom(editor.current), [editor]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [picker, setPicker] = useState<Picker>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // the payment plan: the package's own, or a custom one (2 to 12 payments with dates)
  const wasCustom = editor.current.plan === 'CUSTOM';
  const [customPlan, setCustomPlan] = useState(wasCustom);
  const [planTotal, setPlanTotal] = useState(editor.current.total);
  const [planRows, setPlanRows] = useState<PlanDraftRow[]>(() =>
    wasCustom
      ? editor.current.schedule.map((p, k) => ({ key: `c${k}`, amount: p.amount.toFixed(2), date: p.due_at ? parseISO(p.due_at) : null }))
      : startingPlan(editor.current.total, editor.current.event_start_at ?? editor.current.scheduled_at),
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (key: string, patch: Partial<Draft['lines'][number]>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const kept = new Set([...draft.lines.map((l) => l.add_on_id), ...editor.current.lines.filter((l) => draft.lines.some((d) => d.extra_id === l.extra_id)).map((l) => l.add_on_id)].filter(Boolean));
  const addable = [...editor.add_ons, ...editor.fees].filter((a) => !kept.has(a.id));
  const startIso = draft.start?.toISOString() ?? editor.current.event_start_at ?? editor.current.scheduled_at;
  const endIso = draft.end?.toISOString() ?? editor.current.event_end_at;
  // the last day a payment can be due: the event start, or a week after the event for a pay-after-service package
  const latest = editor.payment_plan?.pay_after && (endIso || startIso) ? addDays(parseISO((endIso || startIso)!), 7).toISOString() : startIso;
  const problem =
    draftError(draft, { needsGuests: editor.needs_guest_count, customizations: editor.customizations }) ??
    (customPlan ? planError(planRows, planTotal, { feeOwed: editor.current.service_fee, latest }) : null);
  const body = () => ({
    ...draftPayload(draft, initial, editor.customizations),
    // a custom plan, or back to the package's own (null); left out when it stays as it was
    ...(customPlan ? { payment_plan: planPayload(planRows, startIso) } : wasCustom ? { payment_plan: null } : {}),
  });

  /** The total after the other changes, for the plan to add up to (worked out by the server on the package's plan). */
  const refreshTotal = async () => {
    setBusy(true);
    try {
      const res = await BookingService.previewChanges(bookingId, { ...draftPayload(draft, initial, editor.customizations), payment_plan: null });
      setPlanTotal(res.data.data.after.total);
    } catch {
      // nothing else changed: the total is the request's
      setPlanTotal(editor.current.total);
    } finally {
      setBusy(false);
    }
  };

  const pick = (_: unknown, selected?: Date) => {
    const which = picker;
    if (Platform.OS !== 'ios') setPicker(null);
    if (!selected || !which) return;
    // a new start moves the end with it (a multi-day event keeps its length); the end is set on its own day
    if (which === 'date') setDraft((d) => moveStart(d, withTime(selected, d.start)));
    else if (which === 'start') setDraft((d) => moveStart(d, withTime(d.start ?? selected, selected)));
    else if (which === 'endDate') setDraft((d) => setEnd(d, withTime(selected, d.end ?? d.start)));
    else setDraft((d) => setEnd(d, withTime(d.end ?? d.start ?? selected, selected)));
  };

  const toReview = async () => {
    if (problem) return Alert.alert('Check the changes', problem);
    setBusy(true);
    try {
      const [res, mine] = await Promise.all([BookingService.previewChanges(bookingId, body()), ContractsService.vendorList().catch(() => null)]);
      const d: Review = res.data.data;
      if (d.missing_message) return Alert.alert('More details needed', d.missing_message);
      setPlanTotal(d.after.total);
      setHasSaved(!!mine?.data?.data?.has_saved_signature);
      setReview(d);
    } catch (err) {
      Alert.alert('Could not work out the changes', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async (signature: SignaturePayload) => {
    setBusy(true);
    try {
      await BookingService.sendChanges(bookingId, body(), signature);
      setReview(null);
      Alert.alert('Changes sent', `${customerName} can now review them and approve or decline.`);
      onSent();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setReview(null);
        Alert.alert('Something changed', 'Please check the changes again.');
      } else {
        Alert.alert('Could not send the changes', apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const pickerValue = picker === 'end' || picker === 'endDate' ? draft.end ?? draft.start : draft.start;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={review ? () => setReview(null) : onClose}>
      {review ? (
        <SignContractView
          title={review.title}
          body={review.body}
          contentSha256={review.content_sha256}
          consentText={review.consent_text}
          vendor={{ hasSavedSignature: hasSaved }}
          submitLabel="Sign and send"
          busy={busy}
          onSubmit={send}
          onCancel={() => setReview(null)}
          subtitle={`Check the new total, then sign. ${customerName} approves or declines; you then Accept & Sign as usual.`}
          intro={<ChangesComparison comparison={review} vendorName="you" />}
        />
      ) : (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={s.close}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.title}>Suggest changes</Text>
            <View style={{ width: 48 }} />
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <Text style={s.muted}>Change what you need. The package price stays the same; {customerName} sees what changed and approves or declines.</Text>

            <Text style={s.h2}>When</Text>
            <Text style={s.small}>Starts</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[ui.field, { flex: 1.4 }]} onPress={() => setPicker('date')} accessibilityRole="button" accessibilityLabel="Start date">
                <Ionicons name="calendar-outline" size={20} color={DARK.muted} />
                <Text style={s.value}>{draft.start ? format(draft.start, 'EEE, dd MMM') : 'Date'}</Text>
              </Pressable>
              <Pressable style={[ui.field, { flex: 1 }]} onPress={() => setPicker('start')} accessibilityRole="button" accessibilityLabel="Start time">
                <Ionicons name="time-outline" size={20} color={DARK.muted} />
                <Text style={s.value}>{draft.start && editor.current.event_start_at ? format(draft.start, 'h:mm a') : 'Time'}</Text>
              </Pressable>
            </View>
            <Text style={s.small}>Ends</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[ui.field, { flex: 1.4 }]} onPress={() => setPicker('endDate')} accessibilityRole="button" accessibilityLabel="End date">
                <Ionicons name="calendar-outline" size={20} color={DARK.muted} />
                <Text style={s.value}>{draft.end ? format(draft.end, 'EEE, dd MMM') : 'Date'}</Text>
              </Pressable>
              <Pressable style={[ui.field, { flex: 1 }]} onPress={() => setPicker('end')} accessibilityRole="button" accessibilityLabel="End time">
                <Ionicons name="time-outline" size={20} color={DARK.muted} />
                <Text style={s.value}>{draft.end ? format(draft.end, 'h:mm a') : 'Time'}</Text>
              </Pressable>
            </View>
            {picker && (
              <DateTimePicker value={pickerValue ?? new Date()} mode={picker === 'date' || picker === 'endDate' ? 'date' : 'time'} minimumDate={picker === 'date' ? new Date() : undefined} onChange={pick} themeVariant="dark" />
            )}
            {Platform.OS === 'ios' && picker && (
              <TouchableOpacity style={{ alignSelf: 'flex-end', padding: 8 }} onPress={() => setPicker(null)}>
                <Text style={s.link}>Done</Text>
              </TouchableOpacity>
            )}
            <Text style={ui.label}>Guests{editor.needs_guest_count ? ' (required)' : ''}</Text>
            <View style={ui.field}>
              <Ionicons name="people-outline" size={20} color={DARK.muted} />
              <TextInput style={ui.input} value={draft.guests} onChangeText={(t) => set({ guests: t.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="How many guests" placeholderTextColor={DARK.muted} accessibilityLabel="Guests" />
            </View>

            <Text style={s.h2}>Add-ons and fees</Text>
            {!draft.lines.length && <Text style={s.muted}>None on this request.</Text>}
            {draft.lines.map((l) => (
              <View key={l.key} style={s.line}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.value, { flex: 1 }]}>
                    {l.name}
                    {l.kind === 'FEE' ? <Text style={s.muted}>  Fee</Text> : null}
                  </Text>
                  <Pressable onPress={() => set({ lines: draft.lines.filter((x) => x.key !== l.key) })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${l.name}`}>
                    <Ionicons name="trash-outline" size={20} color="#fca5a5" />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1.3, gap: 4 }}>
                    <Text style={s.small}>Price {unitWord(l.price_unit)}</Text>
                    <View style={s.smallField}>
                      <Text style={s.muted}>$</Text>
                      <TextInput style={ui.input} value={l.unit_price} onChangeText={(t) => setLine(l.key, { unit_price: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" accessibilityLabel={`Price of ${l.name}`} />
                    </View>
                  </View>
                  {countsQuantity(l.price_unit) ? (
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.small}>Quantity</Text>
                      <View style={s.smallField}>
                        <TextInput style={ui.input} value={l.quantity} onChangeText={(t) => setLine(l.key, { quantity: t.replace(/\D/g, '') })} keyboardType="number-pad" accessibilityLabel={`Quantity of ${l.name}`} />
                      </View>
                    </View>
                  ) : (
                    <Text style={[s.small, { flex: 1, alignSelf: 'flex-end', paddingBottom: 14 }]}>Counted on the {l.price_unit === 'PER_PERSON' ? 'guests' : 'hours'}</Text>
                  )}
                </View>
                {Number(l.unit_price) !== l.usual_price && <Text style={s.small}>Was {money(l.usual_price)}</Text>}
              </View>
            ))}
            {addable.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={s.small}>Add one</Text>
                <View style={s.chips}>
                  {addable.map((a) => (
                    <Pressable key={a.id} style={s.chip} onPress={() => set({ lines: [...draft.lines, lineFor(a)] })} accessibilityRole="button" accessibilityLabel={`Add ${a.name}`}>
                      <Ionicons name="add" size={16} color={DARK.accent} />
                      <Text style={s.chipText}>
                        {a.kind === 'FEE' ? 'Fee: ' : ''}
                        {a.name} · {money(a.price)} {unitWord(a.price_unit)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {draft.travelFee !== undefined && (
              <>
                <Text style={s.h2}>Travel fee</Text>
                <Text style={s.muted}>
                  {editor.current.travel?.status === 'UNPRICED'
                    ? 'We couldn’t place the customer’s address on the map, so no travel fee was added. Set one here if you charge it.'
                    : `Worked out from your package: ${editor.current.travel?.label}. You can change it for this booking.`}
                </Text>
                <View style={s.smallField}>
                  <Text style={s.muted}>$</Text>
                  <TextInput
                    style={ui.input}
                    value={draft.travelFee}
                    onChangeText={(t) => set({ travelFee: t.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={DARK.muted}
                    accessibilityLabel="Travel fee for this booking"
                  />
                </View>
              </>
            )}

            {editor.customizations.length > 0 && (
              <>
                <Text style={s.h2}>Customizations</Text>
                <CustomizationPicker groups={editor.customizations} value={draft.picks} onChange={(picks) => set({ picks })} />
              </>
            )}

            <Text style={s.h2} accessibilityRole="header">Payment plan</Text>
            {[false, true].map((custom) => (
              <Pressable
                key={String(custom)}
                style={[s.option, customPlan === custom && s.optionOn]}
                onPress={() => setCustomPlan(custom)}
                accessibilityRole="radio"
                accessibilityState={{ checked: customPlan === custom }}
              >
                <Ionicons name={customPlan === custom ? 'radio-button-on' : 'radio-button-off'} size={20} color={customPlan === custom ? DARK.accent : DARK.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.value}>{custom ? 'A custom payment plan' : 'The package’s plan'}</Text>
                  <Text style={s.small}>
                    {custom
                      ? 'Split the total into 2 to 12 payments, each charged on its date.'
                      : editor.payment_plan
                        ? PLAN_LABELS[editor.payment_plan.package_plan as PaymentPlan] ?? editor.payment_plan.package_plan_label
                        : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
            {customPlan && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={s.value}>Total to split: {money(planTotal)}</Text>
                  <Pressable onPress={refreshTotal} disabled={busy} accessibilityRole="button">
                    <Text style={s.link}>Update after my other changes</Text>
                  </Pressable>
                </View>
                <PaymentPlanEditor rows={planRows} onChange={setPlanRows} total={planTotal} feeOwed={editor.current.service_fee} firstLabel="When you accept" latest={latest} />
              </>
            )}

            <Text style={ui.label}>Note to {customerName} (optional)</Text>
            <TextInput
              style={s.note}
              value={draft.note}
              onChangeText={(t) => set({ note: t })}
              maxLength={MAX_NOTE}
              multiline
              textAlignVertical="top"
              placeholder="Why the changes, in a sentence or two"
              placeholderTextColor={DARK.muted}
            />

            {!!problem && <Text style={s.warn}>{problem}</Text>}
            <GradientButton title="Review new total" onPress={toReview} loading={busy} disabled={!!problem} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { padding: 20, paddingBottom: 56, gap: 12 },
  h2: { color: '#fff', fontSize: 17, fontFamily: FONTS.semibold, marginTop: 8 },
  value: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  small: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  link: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
  line: { backgroundColor: DARK.card, borderRadius: 16, padding: 14, gap: 10 },
  smallField: { height: 48, borderRadius: 16, backgroundColor: DARK.field, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: DARK.border },
  chipText: { color: '#fff', fontSize: 13, fontFamily: FONTS.medium },
  note: { minHeight: 90, borderRadius: 16, backgroundColor: DARK.field, padding: 14, color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
  warn: { color: '#fcd34d', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: DARK.border },
  optionOn: { borderColor: DARK.accent },
});
