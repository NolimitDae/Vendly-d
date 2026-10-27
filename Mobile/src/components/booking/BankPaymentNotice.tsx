import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { BANK_CLEARING_TEXT, PaymentsService, type PaymentTimeline } from '../../services/payments.service';

const money = (n: number) => `$${Number(n).toFixed(2)}`;

/**
 * The vendor's view of a customer's bank payment that is still clearing (large bookings): what's on
 * its way, and that the payout waits for it. Reads the payments timeline; hidden when nothing is processing.
 */
export default function BankPaymentNotice({ bookingId, reloadKey }: { bookingId: string; reloadKey?: number }) {
  const [t, setT] = useState<PaymentTimeline | null>(null);

  useEffect(() => {
    let live = true;
    PaymentsService.timeline(bookingId)
      .then((res) => live && setT(res.data?.data ?? null))
      .catch(() => live && setT(null));
    return () => {
      live = false;
    };
  }, [bookingId, reloadKey]);

  const processing = Number(t?.processing ?? 0);
  if (!t || processing <= 0) return null;
  const items = t.installments.filter((i) => i.clearing).map((i) => i.label.toLowerCase());
  return (
    <View style={s.note} accessibilityRole="summary">
      <Ionicons name="business-outline" size={18} color="#fcd34d" />
      <Text style={s.text}>
        Processing: the customer is paying {money(processing)} ({items.join(', ')}) from their bank account. Bank payments take {BANK_CLEARING_TEXT} to clear. You’re paid for it once it has, and a deposit can be released early only after that.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(252, 211, 77, 0.12)' },
  text: { flex: 1, color: '#fde68a', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
