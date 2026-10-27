import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { RentalsService, type RentalItem } from '../../services/rentals.service';
import type { VendorDashboardStackParams } from '../../navigation/types';
import LicenceNotice from '../../components/LicenceNotice';
import RentalDeliveryFee from '../../components/rentals/RentalDeliveryFee';

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Live', color: '#5BD69A' },
  PAUSED: { label: 'Paused', color: '#F5B700' },
  DRAFT: { label: 'Draft', color: DARK.muted },
};

/** The vendor's rental stock: what's out today, what's live, and a way in to each item's calendar. */
export default function RentalInventory({ navigation }: NativeStackScreenProps<VendorDashboardStackParams, 'RentalInventory'>) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await RentalsService.mine();
      setItems(res.data?.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const units = items.reduce((n, i) => n + i.quantity, 0);
  const out = items.reduce((n, i) => n + (i.quantity - (i.available_today ?? i.quantity)), 0);

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader
        title="Rental Inventory"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => navigation.navigate('RentalItemForm')} style={s.add} accessibilityRole="button" accessibilityLabel="Add rental item">
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        }
      />
      {loading ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <LicenceNotice things="rental items" />
              <RentalDeliveryFee />
              {items.length ? (
                <View style={s.stats}>
                  <Stat label="Items" value={items.length} />
                  <Stat label="Units" value={units} />
                  <Stat label="Out today" value={out} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="cube-outline" size={44} color={DARK.accent} />
              <Text style={s.emptyTitle}>Rent out your gear</Text>
              <Text style={s.emptyText}>List chairs, decor, lighting or AV by the day. Vendly tracks stock per date, holds a security deposit and pays you when it comes back.</Text>
              <GradientButton title="Add your first item" onPress={() => navigation.navigate('RentalItemForm')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            </View>
          }
          renderItem={({ item }) => {
            const st = STATUS[item.status] ?? STATUS.DRAFT;
            const free = item.available_today ?? item.quantity;
            return (
              <Pressable style={s.card} onPress={() => navigation.navigate('RentalItemDetail', { itemId: item.id })} accessibilityRole="button" accessibilityLabel={item.title}>
                <View style={s.thumb}>{item.images[0] ? <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="cube-outline" size={26} color={DARK.muted} />}</View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.muted}>${Number(item.daily_rate).toFixed(2)}/day{item.deposit_amount > 0 ? ` · $${Number(item.deposit_amount).toFixed(0)} deposit` : ''}</Text>
                  <View style={s.bar}>
                    <View style={[s.barFill, { width: `${item.quantity ? (free / item.quantity) * 100 : 0}%` }]} />
                  </View>
                  <Text style={s.muted}>{free} of {item.quantity} free today</Text>
                </View>
                <View style={[s.pill, { borderColor: st.color }]}>
                  <Text style={[s.pillText, { color: st.color }]}>{st.label}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  stat: { flex: 1, backgroundColor: DARK.card, borderRadius: 14, padding: 12, gap: 2 },
  statValue: { color: '#fff', fontSize: 20, fontFamily: FONTS.bold },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 16, padding: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  bar: { height: 5, borderRadius: 3, backgroundColor: DARK.field, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 5, borderRadius: 3, backgroundColor: DARK.accent },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontFamily: FONTS.semibold },
  empty: { alignItems: 'center', gap: 8, padding: 28, backgroundColor: DARK.card, borderRadius: 20 },
  emptyTitle: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  emptyText: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular, textAlign: 'center' },
});
