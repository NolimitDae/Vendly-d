import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AddCardSheet from '../../components/AddCardSheet';
import AddBankSheet from '../../components/AddBankSheet';
import { GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { BANK_CLEARING_TEXT, isBankAccount, PaymentsService, wholeMoney, type SavedCard } from '../../services/payments.service';
import { usePaymentSettings } from '../../hooks/usePaymentSettings';
import { apiMessage } from '../auth/SignIn';

export const cardBrand = (b?: string) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
/** "Visa •••• 4242" or "Bank account •••• 6789" */
export const methodLabel = (m: SavedCard) => (isBankAccount(m) ? `Bank account •••• ${m.last4}` : `${cardBrand(m.brand)} •••• ${m.last4}`);

export function CardRow({ card, selected, onPress, right }: { card: SavedCard; selected?: boolean; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable style={[s.card, selected && s.cardOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}>
      <View style={s.brand}>
        <Ionicons name={isBankAccount(card) ? 'business-outline' : 'card-outline'} size={22} color={DARK.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle}>{methodLabel(card)}</Text>
        {isBankAccount(card) ? (
          <Text style={s.cardSub}>{card.bank_name ? `${card.bank_name} · ` : ''}Payments take {BANK_CLEARING_TEXT} to clear</Text>
        ) : (
          <Text style={s.cardSub}>Expires {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}{card.is_default ? ' · Default' : ''}</Text>
        )}
      </View>
      {right ?? (selected != null && <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? DARK.accent : DARK.muted} />)}
    </Pressable>
  );
}

export default function PaymentMethods({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  // bank accounts pay only for large bookings (Admin → Settings; off when there's no threshold)
  const { large_payment_threshold: largeFrom } = usePaymentSettings();

  const load = useCallback(async () => {
    try {
      const res = await PaymentsService.cards({ bank: true });
      setCards(res.data?.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = (c: SavedCard) =>
    Alert.alert(isBankAccount(c) ? 'Remove this bank account?' : 'Remove this card?', `${isBankAccount(c) ? 'The bank account' : cardBrand(c.brand)} ending ${c.last4} will no longer be saved.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await PaymentsService.removeCard(c.id);
            load();
          } catch (err) {
            Alert.alert('Could not remove', apiMessage(err, 'Try again in a moment.'));
          }
        },
      },
    ]);

  const makeDefault = async (c: SavedCard) => {
    try {
      await PaymentsService.setDefault(c.id);
      load();
    } catch (err) {
      Alert.alert('Could not update', apiMessage(err, 'Try again in a moment.'));
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }}>
        <ScreenHeader title="Payments & Payouts" onBack={() => navigation.goBack()} />
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Text style={s.h2}>Saved cards</Text>
          <Text style={s.body}>Vendors are paid from your saved card when they accept a request. Nothing is charged before that.</Text>
          {loading ? (
            <ActivityIndicator color={DARK.accent} />
          ) : cards.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="card-outline" size={40} color={DARK.accent} />
              <Text style={s.emptyText}>No cards yet</Text>
            </View>
          ) : (
            cards.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                right={
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    {!c.is_default && !isBankAccount(c) && (
                      <Pressable onPress={() => makeDefault(c)} hitSlop={8} accessibilityLabel="Make default">
                        <Text style={s.link}>Default</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel={isBankAccount(c) ? 'Remove bank account' : 'Remove card'}>
                      <Ionicons name="trash-outline" size={20} color="#fca5a5" />
                    </Pressable>
                  </View>
                }
              />
            ))
          )}
          <GradientButton title="Add a card" onPress={() => setAdding(true)} />
          {!!largeFrom && (
            <View style={{ gap: 8 }}>
              <Pressable style={s.bankLink} onPress={() => setAddingBank(true)} accessibilityRole="button" accessibilityLabel="Add a bank account">
                <Ionicons name="business-outline" size={20} color={DARK.accent} />
                <Text style={s.link}>Add a bank account</Text>
              </Pressable>
              <Text style={s.cardSub}>A bank account can pay for bookings of {wholeMoney(largeFrom)} or more. Bank payments take {BANK_CLEARING_TEXT} to clear.</Text>
            </View>
          )}
          <Pressable style={s.txLink} onPress={() => navigation.navigate('Transactions', { role: 'customer' })} accessibilityRole="button" accessibilityLabel="Transactions">
            <Ionicons name="receipt-outline" size={22} color={DARK.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.txTitle}>Transactions</Text>
              <Text style={s.txSub}>Your charges and refunds</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={DARK.muted} />
          </Pressable>
        </View>
      </ScrollView>
      <AddCardSheet visible={adding} onClose={() => setAdding(false)} onSaved={() => load()} />
      <AddBankSheet visible={addingBank} onClose={() => setAddingBank(false)} onSaved={() => load()} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, borderRadius: 16, backgroundColor: DARK.card },
  emptyText: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.card },
  cardOn: { borderColor: DARK.border },
  brand: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  cardSub: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  bankLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 6 },
  txLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: DARK.card },
  txTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  txSub: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
});
