import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { ContractsService } from '../../services/contracts.service';
import { distanceText, type TravelQuote } from '../../utils/travelFee';

/** Wait this long after typing stops before asking (picking a suggestion changes the address at once). */
const PAUSE_MS = 700;

/**
 * The distance and travel fee for the address being entered, worked out on the server. Only an estimate
 * for the customer: the request prices it again itself.
 */
export default function TravelFeeQuote({ listingId, address, termsText }: { listingId: string; address: string; termsText: string }) {
  const [quote, setQuote] = useState<TravelQuote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const a = address.trim();
    setQuote(null);
    if (a.length < 5) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      ContractsService.travelFee(listingId, a)
        .then((res) => live && setQuote(res.data?.data?.applies ? res.data.data : null))
        .catch(() => live && setQuote(null))
        .finally(() => live && setLoading(false));
    }, PAUSE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [listingId, address]);

  const distance = quote && distanceText(quote);
  return (
    <View style={s.box} accessibilityLiveRegion="polite">
      <View style={s.row}>
        <Ionicons name="car-outline" size={18} color={DARK.accent} />
        <Text style={s.text}>Travel fee: {termsText}.</Text>
      </View>
      {loading && (
        <View style={s.row}>
          <ActivityIndicator size="small" color={DARK.muted} />
          <Text style={s.hint}>Working out the distance…</Text>
        </View>
      )}
      {!loading && quote?.status === 'PRICED' && (
        <Text style={s.fee}>
          {distance ? `${distance}. ` : ''}Your travel fee: ${(quote.fee ?? 0).toFixed(2)}
        </Text>
      )}
      {!loading && !!quote?.message && <Text style={s.warn}>{quote.message}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: DARK.field, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  text: { flex: 1, color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
  hint: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium },
  fee: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.semibold },
  warn: { color: '#FBBF24', fontSize: 12, lineHeight: 18, fontFamily: FONTS.medium },
});
