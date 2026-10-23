import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Chip, ScreenHeader, ui } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { BookingMoneyService, money, type TransactionRow, type TransactionsPage, type TransactionType } from '../../services/bookingMoney.service';

type Filter = 'all' | TransactionType;
type Params = { Transactions: { role?: 'customer' | 'vendor' } | undefined };

const FILTERS: Record<'customer' | 'vendor', { key: Filter; label: string }[]> = {
  customer: [
    { key: 'all', label: 'All' },
    { key: 'payment', label: 'Payments' },
    { key: 'fee', label: 'Fees' },
    { key: 'refund', label: 'Refunds' },
  ],
  vendor: [
    { key: 'all', label: 'All' },
    { key: 'payment', label: 'Payments' },
    { key: 'payout', label: 'Payouts' },
    { key: 'fee', label: 'Commission' },
    { key: 'refund', label: 'Refunds' },
  ],
};

const STATUS: Record<TransactionRow['status'], { label: string; color: string }> = {
  completed: { label: 'Completed', color: '#6ee7c7' },
  pending: { label: 'Pending', color: '#fcd34d' },
  failed: { label: 'Failed', color: '#fca5a5' },
  refunded: { label: 'Refunded', color: DARK.accent },
};

const PAGE_SIZE = 20;

/**
 * Money history (GET /payments/transactions): customers see charges and refunds (from Profile →
 * Payments), vendors see payments received, payouts, commission and refunds (from Payouts).
 */
export default function Transactions() {
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const role = useRoute<RouteProp<Params, 'Transactions'>>().params?.role ?? 'customer';
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [meta, setMeta] = useState<TransactionsPage['meta'] | null>(null);
  const [totals, setTotals] = useState<TransactionsPage['totals'] | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (next: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await BookingMoneyService.transactions({ role, type: filter, q, page: next, limit: PAGE_SIZE });
        const body = res.data;
        setRows((prev) => (next === 1 ? body.data ?? [] : [...prev, ...(body.data ?? [])]));
        setMeta(body.meta ?? null);
        setTotals(body.totals ?? null);
        setPage(next);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [role, filter, q],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const openBooking = (id: string) => {
    // the booking lives in the Bookings tab
    if (role === 'vendor') nav.navigate('BookingsTab', { screen: 'VendorBookingDetail', params: { bookingId: id }, initial: false });
    else nav.navigate('BookingsTab', { screen: 'BookingDetail', params: { bookingId: id }, initial: false });
  };

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <ScreenHeader title="Transactions" onBack={() => nav.goBack()} />
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        {totals && (
          <Text style={s.totals}>
            In <Text style={{ color: '#6ee7c7' }}>{money(totals.in)}</Text> · Out <Text style={{ color: '#fff' }}>{money(totals.out)}</Text>
          </Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS[role].map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
        <View style={ui.field}>
          <Ionicons name="search" size={18} color={DARK.muted} />
          <TextInput
            style={ui.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by booking"
            placeholderTextColor={DARK.muted}
            returnKeyType="search"
            accessibilityLabel="Search by booking"
            clearButtonMode="while-editing"
          />
        </View>
      </View>
    </View>
  );

  const empty = loading ? (
    <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
  ) : error ? (
    <Pressable style={s.empty} onPress={() => load(1)} accessibilityRole="button">
      <Ionicons name="cloud-offline-outline" size={36} color={DARK.muted} />
      <Text style={s.emptyText}>Transactions couldn’t be loaded. Tap to try again.</Text>
    </Pressable>
  ) : (
    <View style={s.empty}>
      <Ionicons name="receipt-outline" size={36} color={DARK.muted} />
      <Text style={s.emptyText}>
        {q || filter !== 'all' ? 'No transactions match.' : role === 'vendor' ? 'Payments and payouts will show here.' : 'Your payments and refunds will show here.'}
      </Text>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={DARK.accent} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && meta && page < meta.last_page) load(page + 1);
        }}
        ListFooterComponent={loading && rows.length ? <ActivityIndicator color={DARK.accent} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => {
          const incoming = item.amount > 0;
          const st = STATUS[item.status];
          return (
            <Pressable
              style={s.row}
              onPress={item.booking_id ? () => openBooking(item.booking_id!) : undefined}
              disabled={!item.booking_id}
              accessibilityRole={item.booking_id ? 'button' : undefined}
              accessibilityLabel={`${item.description}, ${incoming ? 'plus' : 'minus'} ${money(Math.abs(item.amount), item.currency)}, ${st.label}`}
            >
              <View style={s.icon}>
                <Ionicons name={incoming ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={incoming ? '#6ee7c7' : '#fff'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.description}</Text>
                <Text style={s.muted} numberOfLines={1}>
                  {format(parseISO(item.date), 'dd MMM yyyy')}
                  {item.booking_title ? ` · ${item.booking_title}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.amount, incoming && { color: '#6ee7c7' }, item.status === 'failed' && s.struck]}>
                  {incoming ? '+' : ''}
                  {money(item.amount, item.currency)}
                </Text>
                <Text style={[s.status, { color: st.color }]}>{st.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  totals: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: DARK.card },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  muted: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },
  amount: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  struck: { textDecorationLine: 'line-through', color: DARK.muted },
  status: { fontSize: 12, fontFamily: FONTS.medium, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 32 },
  emptyText: { color: DARK.muted, fontSize: 14, textAlign: 'center', fontFamily: FONTS.regular },
});
