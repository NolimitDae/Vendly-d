import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { BookingService } from '../../services/booking.service';
import { ContractsService, SignaturePayload, apiError, openSignedLink } from '../../services/contracts.service';
import ContractBody from './ContractBody';
import ContractStatusBadge from './ContractStatusBadge';
import SignContractView from './SignContractView';

interface ContractSummary {
  id: string;
  version: number;
  status: string;
  title: string;
  is_amendment: boolean;
  awaiting_role: string | null;
  can_sign: boolean;
  verification_code: string;
  amendment_changes: Record<string, unknown> | null;
  signatures: { role: string; legal_name: string; signed_at: string }[];
}

interface Props {
  bookingId: string;
  role: 'VENDOR' | 'CUSTOMER';
  bookingStatus: string;
  /** Reports whether this booking has a contract (legacy bookings don't). */
  onLoaded?: (hasContract: boolean) => void;
  onChanged?: () => void;
}

type SignTarget = {
  mode: 'accept' | 'amendment';
  contractId: string;
  title: string;
  body: string;
  content_sha256: string;
  consent_text: string;
  source_pdf_url: string | null;
  hasSavedSignature: boolean;
};

export default function BookingContractCard({ bookingId, role, bookingStatus, onLoaded, onChanged }: Props) {
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<{ title: string; body: string } | null>(null);
  const [signing, setSigning] = useState<SignTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ContractsService.forBooking(bookingId);
      setContracts(res.data.data.contracts);
      setCurrentId(res.data.data.current_id);
      onLoaded?.(res.data.data.contracts.length > 0);
    } catch {
      setContracts([]);
      onLoaded?.(false);
    } finally {
      setLoading(false);
    }
  }, [bookingId, onLoaded]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const current = contracts.find((c) => c.id === currentId) ?? null;
  const pendingAmendment = contracts.find((c) => c.is_amendment && c.awaiting_role);
  const needsVendorSignature =
    role === 'VENDOR' && bookingStatus === 'PENDING' && current?.status === 'AWAITING_VENDOR' && !current.is_amendment;

  const view = async (id: string) => {
    try {
      const res = await ContractsService.get(id);
      setViewing({ title: res.data.data.title, body: res.data.data.body });
    } catch (err) {
      Alert.alert('Error', apiError(err));
    }
  };

  const openSigning = async (mode: SignTarget['mode'], contractId: string) => {
    setBusy(true);
    try {
      const res = await ContractsService.get(contractId);
      const d = res.data.data;
      let sourceUrl: string | null = null;
      if (d.has_source_pdf) sourceUrl = (await ContractsService.downloadLink(contractId, 'source')).data.data.url;
      let hasSaved = false;
      if (role === 'VENDOR') hasSaved = !!(await ContractsService.vendorList()).data.data.has_saved_signature;
      setSigning({
        mode,
        contractId,
        title: d.title,
        body: d.body,
        content_sha256: d.content_sha256,
        consent_text: d.consent_text,
        source_pdf_url: sourceUrl,
        hasSavedSignature: hasSaved,
      });
    } catch (err) {
      Alert.alert('Error', apiError(err, "Couldn't open the contract"));
    } finally {
      setBusy(false);
    }
  };

  const submitSignature = async (signature: SignaturePayload) => {
    if (!signing) return;
    setBusy(true);
    try {
      if (signing.mode === 'accept') await BookingService.confirmBooking(bookingId, signature);
      else await ContractsService.sign(signing.contractId, signature);
      setSigning(null);
      Alert.alert('Signed', signing.mode === 'accept' ? 'Contract signed and booking confirmed.' : 'Amendment signed. The new version is now in force.');
      await load();
      onChanged?.();
    } catch (err) {
      Alert.alert('Error', apiError(err, "Couldn't sign"));
    } finally {
      setBusy(false);
    }
  };

  const declineBooking = () =>
    Alert.alert('Decline booking', 'Decline this request? The contract becomes void and nothing is charged.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await BookingService.rejectBooking(bookingId);
            await load();
            onChanged?.();
          } catch (err) {
            Alert.alert('Error', apiError(err));
          }
        },
      },
    ]);

  const declineAmendment = (id: string) =>
    Alert.alert('Decline amendment', 'The current contract stays in force.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await ContractsService.decline(id);
            await load();
          } catch (err) {
            Alert.alert('Error', apiError(err));
          }
        },
      },
    ]);

  const downloadPdf = (id: string) =>
    openSignedLink(() => ContractsService.downloadLink(id, 'executed')).catch((e) => Alert.alert('Error', apiError(e)));

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!current) return null;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.titleRow}>
          <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
          <Text style={s.title}>Contract</Text>
        </View>
        <ContractStatusBadge status={current.status} />
      </View>
      <Text style={s.meta}>{current.title} · version {current.version}</Text>
      {current.signatures.map((sig) => (
        <Text key={sig.role} style={s.small}>
          Signed by {sig.legal_name} ({sig.role.toLowerCase()}) · {format(new Date(sig.signed_at), 'MMM d, yyyy h:mm a')}
        </Text>
      ))}
      {current.status === 'EXECUTED' && <Text style={s.small}>Verification code {current.verification_code}</Text>}

      {needsVendorSignature && (
        <Text style={s.notice}>The customer signed this contract. Review it and Accept &amp; Sign to confirm the booking.</Text>
      )}
      {pendingAmendment && (
        <Text style={s.notice}>
          Amendment (version {pendingAmendment.version}) {pendingAmendment.can_sign ? 'is waiting for your signature.' : 'is waiting for the other party.'}
        </Text>
      )}

      <View style={s.actions}>
        {needsVendorSignature && (
          <>
            <TouchableOpacity style={s.primary} onPress={() => openSigning('accept', current.id)} disabled={busy}>
              {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.primaryText}>Accept &amp; Sign</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.danger} onPress={declineBooking}>
              <Text style={s.dangerText}>Decline</Text>
            </TouchableOpacity>
          </>
        )}
        {pendingAmendment?.can_sign && (
          <>
            <TouchableOpacity style={s.primary} onPress={() => openSigning('amendment', pendingAmendment.id)} disabled={busy}>
              <Text style={s.primaryText}>Review &amp; sign amendment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.danger} onPress={() => declineAmendment(pendingAmendment.id)}>
              <Text style={s.dangerText}>Decline</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={s.secondary} onPress={() => view(current.id)}>
          <Text style={s.secondaryText}>View contract</Text>
        </TouchableOpacity>
        {current.status === 'EXECUTED' && (
          <TouchableOpacity style={s.secondary} onPress={() => downloadPdf(current.id)}>
            <Text style={s.secondaryText}>Signed PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={!!viewing} animationType="slide" onRequestClose={() => setViewing(null)}>
        <View style={s.viewRoot}>
          <View style={s.viewHeader}>
            <TouchableOpacity onPress={() => setViewing(null)} accessibilityLabel="Close" hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.gray[700]} />
            </TouchableOpacity>
            <Text style={s.viewTitle} numberOfLines={1}>{viewing?.title}</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            {viewing && <ContractBody body={viewing.body} />}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!signing} animationType="slide" onRequestClose={() => setSigning(null)}>
        {signing && (
          <SignContractView
            title={signing.title}
            body={signing.body}
            contentSha256={signing.content_sha256}
            consentText={signing.consent_text}
            sourcePdfUrl={signing.source_pdf_url}
            vendor={role === 'VENDOR' ? { hasSavedSignature: signing.hasSavedSignature } : undefined}
            submitLabel={signing.mode === 'accept' ? 'Accept & Sign' : 'Sign amendment'}
            busy={busy}
            onSubmit={submitSignature}
            onCancel={() => setSigning(null)}
          />
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 6, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.gray[900] },
  meta: { fontSize: 13, color: COLORS.gray[600] },
  small: { fontSize: 12, color: COLORS.gray[500] },
  notice: { fontSize: 13, color: '#92400e', backgroundColor: '#fffbeb', padding: 10, borderRadius: 10, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  primaryText: { color: COLORS.white, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: COLORS.gray[200], borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { color: COLORS.gray[800], fontWeight: '600' },
  danger: { borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  dangerText: { color: '#dc2626', fontWeight: '600' },
  viewRoot: { flex: 1, backgroundColor: COLORS.white },
  viewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
  },
  viewTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.gray[900] },
});
