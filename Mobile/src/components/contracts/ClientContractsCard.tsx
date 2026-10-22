import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { ContractsService, SignaturePayload, apiError, openSignedLink } from '../../services/contracts.service';
import ContractStatusBadge from './ContractStatusBadge';
import ContractBody from './ContractBody';
import SignContractView from './SignContractView';

interface Row {
  id: string;
  status: string;
  title: string;
  version: number;
  can_sign: boolean;
  listing_title: string | null;
  vendor_name: string | null;
}
interface Full {
  id: string;
  title: string;
  body: string;
  content_sha256: string;
  consent_text: string;
  can_sign: boolean;
}

/** The planner's client: each vendor contract on the event, co-signing the ones waiting for them. */
export default function ClientContractsCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    ContractsService.clientEventContracts(eventId)
      .then((r) => setRows(r.data?.data ?? []))
      .catch(() => setRows([]));
  }, [eventId]);

  useFocusEffect(load);

  const openContract = async (row: Row) => {
    if (row.status === 'EXECUTED') {
      return openSignedLink(() => ContractsService.downloadLink(row.id, 'executed')).catch((e) => Alert.alert('Error', apiError(e)));
    }
    try {
      const r = await ContractsService.get(row.id);
      setOpen(r.data.data);
      setSigning(false);
    } catch (e) {
      Alert.alert('Error', apiError(e, 'Couldn’t open the contract'));
    }
  };

  const sign = async (signature: SignaturePayload) => {
    if (!open) return;
    setBusy(true);
    try {
      await ContractsService.sign(open.id, signature);
      setOpen(null);
      Alert.alert('Signed', 'Thanks! The vendor can now accept the booking.');
      load();
    } catch (e) {
      Alert.alert('Couldn’t sign', apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) return <ActivityIndicator color={DARK.accent} />;

  return (
    <View style={{ gap: 10 }}>
      {rows.length === 0 && <Text style={s.muted}>No contracts need your signature.</Text>}
      {rows.map((r) => (
        <Card key={r.id} style={s.row}>
          <Ionicons name="document-text-outline" size={22} color={DARK.accent} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.title}>{r.listing_title ?? r.title}</Text>
            <Text style={s.muted}>{r.vendor_name ?? 'Vendor'} · version {r.version}</Text>
            <ContractStatusBadge status={r.status} />
          </View>
          <Pressable style={[s.btn, !r.can_sign && s.btnQuiet]} onPress={() => openContract(r)} accessibilityRole="button">
            <Text style={s.btnText}>{r.can_sign ? 'Co-sign' : r.status === 'EXECUTED' ? 'PDF' : 'View'}</Text>
          </Pressable>
        </Card>
      ))}

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open &&
          (signing ? (
            <SignContractView
              title={open.title}
              body={open.body}
              contentSha256={open.content_sha256}
              consentText={open.consent_text}
              submitLabel="Co-sign contract"
              busy={busy}
              onSubmit={sign}
              onCancel={() => setSigning(false)}
            />
          ) : (
            <View style={s.viewRoot}>
              <View style={s.viewHeader}>
                <Pressable onPress={() => setOpen(null)} accessibilityLabel="Close" hitSlop={12}>
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
                <Text style={s.viewTitle} numberOfLines={1}>{open.title}</Text>
                <View style={{ width: 24 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
                {open.can_sign && (
                  <Text style={s.lead}>Your planner booked this vendor for your event and asked you to co-sign. Read it, then tap Review & co-sign.</Text>
                )}
                <ContractBody body={open.body} />
              </ScrollView>
              {open.can_sign && (
                <Pressable style={s.cta} onPress={() => setSigning(true)} accessibilityRole="button">
                  <Text style={s.ctaText}>Review & co-sign</Text>
                </Pressable>
              )}
            </View>
          ))}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  btn: { paddingHorizontal: 14, height: 36, borderRadius: 99, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center' },
  btnQuiet: { backgroundColor: DARK.field },
  btnText: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold },
  viewRoot: { flex: 1, backgroundColor: DARK.bg, paddingTop: 48 },
  viewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  viewTitle: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.semibold, textAlign: 'center' },
  lead: { color: DARK.muted, fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular, marginBottom: 16 },
  cta: { margin: 20, marginBottom: 36, height: 52, borderRadius: 26, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
});
