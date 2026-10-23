import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DARK, FONTS } from '../../constants/colors';
import { apiError, openSignedLink } from '../../services/contracts.service';
import { BookingMoneyService } from '../../services/bookingMoney.service';

/** "Download invoice": opens the final invoice PDF through a short-lived signed link, like contract PDFs. */
export default function InvoiceButton({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await openSignedLink(() => BookingMoneyService.invoiceLink(bookingId));
    } catch (e) {
      Alert.alert('Invoice', apiError(e, 'The invoice couldn’t be opened. Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable style={s.btn} onPress={open} disabled={busy} accessibilityRole="button" accessibilityLabel="Download invoice">
      {busy ? <ActivityIndicator color={DARK.accent} /> : <Ionicons name="document-text-outline" size={18} color={DARK.accent} />}
      <Text style={s.text}>Download invoice</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, borderWidth: 1, borderColor: DARK.border },
  text: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.semibold },
});
