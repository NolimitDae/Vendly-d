import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, Card, GradientButton, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import { apiMessage } from '../auth/SignIn';

interface Account { accountId?: string | null; payouts_enabled?: boolean; charges_enabled?: boolean; details_submitted?: boolean }
interface Transaction { id: string; amount: number | string; status?: string; type?: string; created_at: string; currency?: string }

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
// The payout API wraps responses in different ways; read the few fields we need wherever they are.
const pick = (res: any, ...keys: string[]) => {
  const d = res?.data?.data ?? res?.data ?? {};
  for (const k of keys) if (d?.[k] != null) return d[k];
  return undefined;
};

export default function Payouts() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState<number | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, a, h] = await Promise.allSettled([api.get('/withdraw/balance'), api.get('/withdraw/account-info'), api.get('/withdraw/history')]);
    if (b.status === 'fulfilled') setBalance(Number(pick(b.value, 'balance', 'available') ?? 0));
    if (a.status === 'fulfilled') {
      const d = a.value.data?.data ?? a.value.data ?? {};
      setAccount({ accountId: d.accountId ?? d.account_id ?? d.id ?? null, payouts_enabled: d.payouts_enabled, charges_enabled: d.charges_enabled, details_submitted: d.details_submitted });
    } else setAccount({ accountId: null });
    if (h.status === 'fulfilled') setHistory(h.value.data?.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const connected = !!account?.accountId && account.payouts_enabled !== false;

  const setUp = async () => {
    setBusy(true);
    try {
      let id = account?.accountId;
      if (!id) {
        const res = await api.post('/withdraw/create-connected-account');
        id = res.data?.data?.accountId;
        if (!id) throw new Error(res.data?.message ?? 'Could not create your payout account');
      }
      const link = await api.post(`/withdraw/onboarding/${id}`);
      const url = link.data?.data?.url;
      if (!url) throw new Error('No onboarding link returned');
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Payout setup', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return Alert.alert('Amount', 'Enter how much to withdraw.');
    // the same minimum as the website and the server
    if (n < 20) return Alert.alert('Amount', 'The minimum withdrawal is $20.');
    if (balance != null && n > balance) return Alert.alert('Amount', `You can withdraw up to ${money(balance)}.`);
    setBusy(true);
    try {
      const res = await api.post('/withdraw/request', { amount: n });
      if (res.data?.success === false) throw new Error(res.data?.message);
      setAmount('');
      Alert.alert('Withdrawal requested', 'It usually arrives in your bank within a few business days.');
      load();
    } catch (err) {
      Alert.alert('Could not withdraw', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      >
        <ScreenHeader title="Payments & Payouts" onBack={() => nav.goBack()} />
        {loading ? (
          <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 20 }}>
            <BrandGradient style={s.balance}>
              <Text style={s.balanceLabel}>Available balance</Text>
              <Text style={s.balanceValue}>{money(balance)}</Text>
              <Text style={s.balanceHint}>Released from completed bookings under the payout rules</Text>
            </BrandGradient>

            {connected ? (
              <Card style={{ gap: 12 }}>
                <Text style={s.h2}>Withdraw to your bank</Text>
                <View style={ui.field}>
                  <Text style={s.currency}>$</Text>
                  <TextInput style={ui.input} placeholder="0.00" placeholderTextColor={DARK.muted} value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
                </View>
                <GradientButton title="Withdraw" onPress={withdraw} loading={busy} disabled={!amount} />
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="card-outline" size={24} color={DARK.accent} />
                  <Text style={s.h2}>Set up payouts</Text>
                </View>
                <Text style={s.body}>Connect a bank account through Stripe to receive what you earn. It takes a couple of minutes and you only do it once.</Text>
                <GradientButton title={account?.accountId ? 'Finish setup' : 'Connect bank account'} onPress={setUp} loading={busy} />
              </Card>
            )}

            <Pressable style={s.txLink} onPress={() => nav.navigate('Transactions', { role: 'vendor' })} accessibilityRole="button" accessibilityLabel="Transactions">
              <Ionicons name="receipt-outline" size={22} color={DARK.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.txTitle}>Transactions</Text>
                <Text style={s.txSub}>Payments, payouts, commission and refunds</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={DARK.muted} />
            </Pressable>

            <View style={{ gap: 10 }}>
              <Text style={s.h2}>Withdrawal history</Text>
              {history.length === 0 ? (
                <Text style={s.muted}>No withdrawals yet.</Text>
              ) : (
                history.map((t) => (
                  <View key={t.id} style={s.txn}>
                    <View style={s.txnIcon}><Ionicons name="arrow-up-outline" size={18} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txnTitle}>Withdrawal</Text>
                      <Text style={s.muted}>{t.created_at ? format(parseISO(t.created_at), 'dd MMM yyyy, h:mm a') : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.txnAmount}>-{money(t.amount)}</Text>
                      <Text style={[s.txnStatus, { color: /paid|succeeded|complete/i.test(t.status ?? '') ? '#6ee7c7' : /fail|reject/i.test(t.status ?? '') ? '#fca5a5' : '#fcd34d' }]}>{t.status ?? 'Pending'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  balance: { borderRadius: 20, padding: 24, gap: 6 },
  balanceLabel: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  balanceValue: { color: '#fff', fontSize: 36, fontFamily: FONTS.semibold },
  balanceHint: { color: '#fff', fontSize: 12, fontFamily: FONTS.regular, opacity: 0.85 },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DARK.card },
  txnIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  txnTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  txnAmount: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  txnStatus: { fontSize: 13, fontFamily: FONTS.medium },
  txLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: DARK.card },
  txTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  txSub: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
});
