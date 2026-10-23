import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { PaymentsService } from '../../services/payments.service';
import { money } from '../../services/bookingMoney.service';

interface RefundInfo {
  refunded?: number;
  refund_card?: string | null;
  refund_timing?: string | null;
  currency?: string;
}

/** "Refund" card on a booking: how much went back, to which card (customers) and when it shows. Hidden when nothing was refunded. */
export default function RefundCard({ bookingId, role, reloadKey }: { bookingId: string; role: 'CUSTOMER' | 'VENDOR'; reloadKey?: number }) {
  const [info, setInfo] = useState<RefundInfo | null>(null);

  useEffect(() => {
    let live = true;
    PaymentsService.timeline(bookingId)
      .then((res) => live && setInfo((res.data?.data as RefundInfo) ?? null))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [bookingId, reloadKey]);

  const amount = Number(info?.refunded ?? 0);
  if (!info || amount <= 0) return null;
  return (
    <Card style={{ gap: 6 }}>
      <View style={s.row}>
        <Ionicons name="refresh-circle-outline" size={22} color={DARK.accent} />
        <Text style={s.title}>Refund</Text>
      </View>
      <Text style={s.amount} accessibilityLabel={`Refund ${money(amount, info.currency)}`}>{money(amount, info.currency)}</Text>
      <Text style={s.body}>
        {role === 'CUSTOMER'
          ? `Back to ${info.refund_card ?? 'the card you paid with'}. Refunds take ${info.refund_timing ?? '5–10 business days'} to show on your statement.`
          : 'Refunded to the customer’s card.'}
      </Text>
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  amount: { color: '#fff', fontSize: 26, fontFamily: FONTS.semibold },
  body: { color: DARK.muted, fontSize: 13, lineHeight: 20, fontFamily: FONTS.regular },
});
