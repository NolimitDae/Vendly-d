import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { GradientButton } from '../brand';
import { BookingService } from '../../services/booking.service';
import { ContractsService, apiError, type SignaturePayload } from '../../services/contracts.service';
import type { ChangesState } from '../../utils/requestChanges';
import SignContractView from '../contracts/SignContractView';
import ChangesComparison from './ChangesComparison';
import SuggestChangesSheet from './SuggestChangesSheet';

interface Props {
  bookingId: string;
  role: 'VENDOR' | 'CUSTOMER';
  bookingStatus: string;
  /** the other side's name, for the messages */
  otherName: string;
  onChanged?: () => void;
}

/**
 * Suggested changes on a booking request. The vendor can suggest changes (and withdraw them while they
 * wait); the customer sees what changed, before and after, and approves and signs, or declines.
 */
export default function RequestChangesCard({ bookingId, role, bookingStatus, otherName, onChanged }: Props) {
  const [state, setState] = useState<ChangesState | null>(null);
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<null | { title: string; body: string; content_sha256: string; consent_text: string; source_pdf_url: string | null }>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (bookingStatus !== 'PENDING') return setState(null);
    try {
      const res = await BookingService.changes(bookingId);
      setState(res.data.data);
    } catch {
      setState(null);
    }
  }, [bookingId, bookingStatus]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (bookingStatus !== 'PENDING' || !state) return null;
  const p = state.proposal;
  const done = async () => {
    await load();
    onChanged?.();
  };

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      await done();
    } catch (err) {
      Alert.alert(fail, apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const openApprove = async () => {
    setBusy(true);
    try {
      const c = (await ContractsService.get(p!.contract_id)).data.data;
      // a vendor's own uploaded contract still applies: the updated terms are its addendum
      const source = c.has_source_pdf ? (await ContractsService.downloadLink(p!.contract_id, 'source')).data.data.url : null;
      setSigning({ title: c.title, body: c.body, content_sha256: c.content_sha256, consent_text: c.consent_text, source_pdf_url: source });
    } catch (err) {
      Alert.alert('Could not open the contract', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const approve = (signature: SignaturePayload) =>
    run(async () => {
      await BookingService.approveChanges(bookingId, signature);
      setSigning(null);
      Alert.alert('Changes approved', `${otherName} can now accept your request.`);
    }, 'Could not approve the changes');

  const decline = () =>
    run(async () => {
      await BookingService.declineChanges(bookingId, reason.trim() || undefined);
      setDeclining(false);
      setReason('');
    }, 'Could not decline the changes');

  const withdraw = () =>
    Alert.alert('Withdraw your changes?', `${otherName}'s original request stands and you can accept it.`, [
      { text: 'Keep them', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => run(() => BookingService.withdrawChanges(bookingId), 'Could not withdraw the changes') },
    ]);

  // ─── Customer ──────────────────────────────────────────────────────────────
  if (role === 'CUSTOMER') {
    if (!p) return null;
    return (
      <View style={s.card}>
        <View style={s.titleRow}>
          <Ionicons name="create-outline" size={18} color={DARK.accent} />
          <Text style={s.title}>{p.status === 'WAITING' ? `${p.vendor_name} suggested changes` : 'Suggested changes'}</Text>
        </View>
        {p.status === 'WAITING' ? (
          <>
            <Text style={s.muted}>
              Here is what {p.vendor_name} would change before accepting. Approve and sign the updated contract, or decline to keep your original request. Your request stays open while you decide.
            </Text>
            <ChangesComparison comparison={p} vendorName={p.vendor_name} />
            {declining ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  style={s.reason}
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                  placeholder="A reason for the vendor (optional)"
                  placeholderTextColor={DARK.muted}
                />
                <View style={s.actions}>
                  <Pressable style={s.danger} onPress={decline} disabled={busy} accessibilityRole="button">
                    <Text style={s.dangerText}>Decline changes</Text>
                  </Pressable>
                  <Pressable style={s.secondary} onPress={() => setDeclining(false)} accessibilityRole="button">
                    <Text style={s.secondaryText}>Back</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <GradientButton title="Approve and sign" onPress={openApprove} loading={busy} />
                <Pressable style={s.danger} onPress={() => setDeclining(true)} disabled={busy} accessibilityRole="button">
                  <Text style={s.dangerText}>Decline changes</Text>
                </Pressable>
              </>
            )}
          </>
        ) : (
          <Text style={s.muted}>
            {p.status === 'APPROVED'
              ? `You approved the changes. ${p.vendor_name} can now accept your request.`
              : p.status === 'DECLINED'
                ? 'You declined the suggested changes. Your original request stands.'
                : `${p.vendor_name} withdrew the changes they suggested. Your original request stands.`}
          </Text>
        )}
        <Modal visible={!!signing} animationType="slide" onRequestClose={() => setSigning(null)}>
          {signing && (
            <SignContractView
              title={signing.title}
              body={signing.body}
              contentSha256={signing.content_sha256}
              consentText={signing.consent_text}
              sourcePdfUrl={signing.source_pdf_url}
              subtitle="Read the updated contract, then sign to approve the changes"
              submitLabel="Approve and sign"
              busy={busy}
              onSubmit={approve}
              onCancel={() => setSigning(null)}
            />
          )}
        </Modal>
      </View>
    );
  }

  // ─── Vendor ────────────────────────────────────────────────────────────────
  if (!p && !state.can_suggest) return null;
  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Ionicons name="create-outline" size={18} color={DARK.accent} />
        <Text style={s.title}>Changes to the request</Text>
      </View>
      {p?.status === 'WAITING' && (
        <>
          <Text style={s.notice}>Your suggested changes are waiting for {otherName}. The request stays open while they decide, and you can accept once they answer.</Text>
          <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={s.toggle}>
            <Text style={s.link}>{open ? 'Hide what you suggested' : 'What you suggested'}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DARK.accent} />
          </Pressable>
          {open && <ChangesComparison comparison={p} vendorName="you" />}
          <Pressable style={s.secondary} onPress={withdraw} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={DARK.accent} /> : <Text style={s.secondaryText}>Withdraw changes</Text>}
          </Pressable>
        </>
      )}
      {p?.status === 'APPROVED' && <Text style={s.notice}>Customer approved your changes. Review the updated contract below and Accept &amp; Sign to confirm the booking.</Text>}
      {p?.status === 'DECLINED' && (
        <Text style={s.muted}>{otherName} declined your suggested changes. Their original request stands: you can accept it, suggest other changes, or decline it.</Text>
      )}
      {p?.status === 'WITHDRAWN' && <Text style={s.muted}>You withdrew your suggested changes. The original request stands.</Text>}
      {state.can_suggest && (
        <>
          {!p && <Text style={s.muted}>Need a different date, guest count, add-ons or prices before you accept? Suggest changes and {otherName} can approve them.</Text>}
          <Pressable style={s.secondary} onPress={() => setEditing(true)} accessibilityRole="button">
            <Text style={s.secondaryText}>Suggest changes</Text>
          </Pressable>
        </>
      )}
      {editing && state.editor && (
        <SuggestChangesSheet
          visible
          bookingId={bookingId}
          editor={state.editor}
          customerName={otherName}
          onClose={() => setEditing(false)}
          onSent={async () => {
            setEditing(false);
            await done();
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 16, fontFamily: FONTS.semibold, color: '#fff' },
  muted: { fontSize: 13, lineHeight: 19, color: DARK.muted, fontFamily: FONTS.regular },
  notice: { fontSize: 13, color: '#fff', backgroundColor: DARK.field, padding: 12, borderRadius: 12, fontFamily: FONTS.medium, lineHeight: 19 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondary: { height: 48, borderWidth: 1, borderColor: DARK.border, borderRadius: 100, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: DARK.accent, fontFamily: FONTS.medium, fontSize: 15 },
  danger: { height: 48, borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 100, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: '#fca5a5', fontFamily: FONTS.medium, fontSize: 15 },
  reason: { minHeight: 80, borderRadius: 16, backgroundColor: DARK.field, padding: 14, color: '#fff', fontSize: 15, fontFamily: FONTS.regular },
});
