import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { ContractsService, apiError, openSignedLink } from '../../services/contracts.service';
import ContractStatusBadge from './ContractStatusBadge';

interface Row {
  booking_id: string;
  listing_title: string | null;
  vendor_name: string;
  pending_amendment: boolean;
  contract: { id: string; status: string } | null;
}

/** Every vendor contract for an event, plus a download-all zip of the signed PDFs. */
export default function EventContractsCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [executed, setExecuted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [zipping, setZipping] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ContractsService.eventContracts(eventId)
        .then((res) => {
          setRows(res.data.data);
          setExecuted(res.data.executed_count);
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, [eventId]),
  );

  const downloadAll = async () => {
    setZipping(true);
    try {
      await openSignedLink(() => ContractsService.eventZip(eventId));
    } catch (err) {
      Alert.alert('Error', apiError(err, "Couldn't prepare the download"));
    } finally {
      setZipping(false);
    }
  };

  const openPdf = (contractId: string) =>
    openSignedLink(() => ContractsService.downloadLink(contractId, 'executed')).catch((e) => Alert.alert('Error', apiError(e)));

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <Ionicons name="document-text-outline" size={18} color={DARK.accent} />
          <Text style={s.title}>Vendor contracts</Text>
        </View>
        <TouchableOpacity style={[s.zip, !executed && { opacity: 0.4 }]} onPress={downloadAll} disabled={!executed || zipping}>
          {zipping ? <ActivityIndicator size="small" color={DARK.accent} /> : <Ionicons name="download-outline" size={16} color={DARK.accent} />}
          <Text style={s.zipText}>All ({executed})</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={DARK.accent} />
      ) : rows.length === 0 ? (
        <Text style={s.muted}>No vendor bookings on this event yet.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.booking_id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.vendor}>{r.vendor_name}</Text>
              <Text style={s.muted}>
                {r.listing_title}
                {r.pending_amendment ? ' · amendment waiting' : ''}
              </Text>
            </View>
            {r.contract ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <ContractStatusBadge status={r.contract.status} />
                {r.contract.status === 'EXECUTED' && (
                  <TouchableOpacity onPress={() => openPdf(r.contract!.id)}>
                    <Text style={s.link}>PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={s.muted}>No contract</Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: DARK.card, borderRadius: 18, padding: 16, gap: 10, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontFamily: FONTS.semibold, color: '#fff' },
  zip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: DARK.border },
  zipText: { color: DARK.accent, fontFamily: FONTS.semibold, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DARK.field },
  vendor: { fontSize: 14, fontFamily: FONTS.semibold, color: '#fff' },
  muted: { fontSize: 12, color: DARK.muted, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontFamily: FONTS.semibold, fontSize: 12 },
});
