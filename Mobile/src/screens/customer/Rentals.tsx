import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { RentalsService, type RentalItem } from '../../services/rentals.service';
import type { CustomerHomeStackParams } from '../../navigation/types';

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Rentals marketplace: decor, furniture, AV and equipment rented by the day. */
export default function Rentals({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'Rentals'>) {
  const insets = useSafeAreaInsets();
  const vendorId = route.params?.vendorId;
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await RentalsService.browse({ search: query || undefined, vendor_id: vendorId });
      setItems(res.data?.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title={route.params?.vendorName ? `${route.params.vendorName} rentals` : 'Rentals'} onBack={() => navigation.goBack()} />
      <View style={s.search}>
        <Ionicons name="search-outline" size={20} color={DARK.muted} />
        <TextInput
          style={s.searchInput}
          placeholder="Chairs, arches, speakers, tents…"
          placeholderTextColor={DARK.muted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setQuery(search.trim())}
          returnKeyType="search"
        />
        {!!search && (
          <Pressable onPress={() => { setSearch(''); setQuery(''); }} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={20} color={DARK.muted} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="cube-outline" size={40} color={DARK.muted} />
              <Text style={s.emptyTitle}>{query ? 'Nothing matches that search' : 'No rentals listed yet'}</Text>
              <Text style={s.emptyText}>Vendors are adding decor, furniture and equipment. Check back soon.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => navigation.navigate('RentalItem', { itemId: item.id })} accessibilityRole="button" accessibilityLabel={item.title}>
              <View style={s.image}>
                {item.images[0] ? <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="cube-outline" size={30} color={DARK.muted} />}
                <View style={s.price}>
                  <Text style={s.priceText}>{money(item.daily_rate)}/day</Text>
                </View>
              </View>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              <View style={s.meta}>
                <Ionicons name="storefront-outline" size={13} color={DARK.muted} />
                <Text style={s.metaText} numberOfLines={1}>{item.vendor?.name ?? 'Vendor'}</Text>
              </View>
              <View style={s.meta}>
                <Ionicons name="layers-outline" size={13} color={DARK.muted} />
                <Text style={s.metaText}>{item.quantity} in stock</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 8, paddingHorizontal: 14, height: 50, borderRadius: 99, backgroundColor: DARK.field, borderWidth: 1, borderColor: DARK.border },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 0 },
  card: { flex: 1, maxWidth: '50%', padding: 10, borderRadius: 16, backgroundColor: DARK.card, gap: 4 },
  image: { height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  price: { position: 'absolute', top: 8, left: 8, backgroundColor: '#F6F8FA', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  priceText: { color: '#030303', fontSize: 11, fontFamily: FONTS.semibold },
  title: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  empty: { alignItems: 'center', gap: 8, padding: 32, backgroundColor: DARK.card, borderRadius: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold, textAlign: 'center' },
  emptyText: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular, textAlign: 'center' },
});
