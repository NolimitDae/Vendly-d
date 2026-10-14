import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useSaved } from '../../hooks/useSaved';
import { MarketplaceService, vendorName, type Category, type Listing } from '../../services/marketplace.service';
import type { CustomerHomeStackParams } from '../../navigation/types';

export default function SearchResults({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'SearchResults'>) {
  const { categoryId, categoryName, location, eventId } = route.params;
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(route.params.q ?? '');
  const [query, setQuery] = useState(route.params.q ?? '');
  const [subs, setSubs] = useState<Category['sub_categories']>([]);
  const [sub, setSub] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const saved = useSaved();

  useEffect(() => {
    if (!categoryId) return;
    MarketplaceService.getCategories()
      .then((r) => setSubs(r.data?.data?.find((c) => c.id === categoryId)?.sub_categories ?? []))
      .catch(() => {});
  }, [categoryId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await MarketplaceService.search({
        q: query || undefined,
        category_id: categoryId,
        sub_category_id: sub || undefined,
        location,
        limit: 30,
      });
      setListings(res.data?.data ?? []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [query, categoryId, sub, location]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={s.root}>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 20 }}>
            <ScreenHeader title={categoryName ?? (query ? 'Results' : 'All Services')} onBack={() => navigation.goBack()} />
            <View style={s.search}>
              <Ionicons name="search-outline" size={20} color={DARK.muted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search service & locations"
                placeholderTextColor={DARK.muted}
                value={q}
                onChangeText={setQ}
                onSubmitEditing={() => setQuery(q.trim())}
                returnKeyType="search"
              />
            </View>
            {subs && subs.length > 0 && (
              <FlatList
                horizontal
                data={[{ id: '', name: 'All' }, ...subs]}
                keyExtractor={(c) => c.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                renderItem={({ item }) => <Chip label={item.name} active={sub === item.id} onPress={() => setSub(item.id)} />}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="search-outline" size={40} color={DARK.muted} />
              <Text style={s.emptyText}>No services match yet</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ResultCard
            item={item}
            saved={saved.has(item.id)}
            onSave={() => saved.toggle(item.id)}
            onPress={() => navigation.navigate('ListingDetail', { listingId: item.id, eventId })}
          />
        )}
      />
    </View>
  );
}

export function ResultCard({ item, saved, onSave, onPress }: { item: Listing; saved: boolean; onSave: () => void; onPress: () => void }) {
  return (
    <Pressable style={s.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      <View style={s.photo}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={40} color={DARK.muted} />
        )}
        <View style={s.price}>
          <Text style={s.priceText}>
            ${Number(item.price).toLocaleString()}
            {item.price_unit && item.price_unit !== 'fixed' ? ` / ${item.price_unit}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onSave}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          style={s.heart}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? '#E0479E' : '#111'} />
        </Pressable>
      </View>
      <Text style={s.title} numberOfLines={1}>{item.title}</Text>
      <View style={s.row}>
        <View style={s.meta}>
          <Ionicons name="storefront-outline" size={16} color="#fff" />
          <Text style={s.metaText} numberOfLines={1}>{vendorName(item.vendor)}</Text>
        </View>
        {!!item.location && (
          <View style={[s.meta, { flexShrink: 1 }]}>
            <Ionicons name="location-outline" size={16} color="#fff" />
            <Text style={s.metaText} numberOfLines={1}>{item.location}</Text>
          </View>
        )}
      </View>
      <View style={s.row}>
        <View style={s.meta}>
          <Ionicons name="pricetag-outline" size={16} color="#fff" />
          <Text style={s.metaText}>{item.category?.name ?? 'Service'}</Text>
        </View>
        {item.avg_rating != null && (
          <View style={s.meta}>
            <Ionicons name="star" size={16} color="#F5B700" />
            <Text style={s.metaText}>{Number(item.avg_rating).toFixed(1)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 99,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 0 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  card: { marginHorizontal: 20, padding: 12, borderRadius: 16, backgroundColor: DARK.card, gap: 8 },
  photo: { height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  price: { position: 'absolute', top: 8, left: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  priceText: { color: '#111', fontSize: 12, fontFamily: FONTS.semibold },
  heart: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, lineHeight: 24, fontFamily: FONTS.semibold, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#fff', fontSize: 14, fontFamily: FONTS.regular, flexShrink: 1 },
});
