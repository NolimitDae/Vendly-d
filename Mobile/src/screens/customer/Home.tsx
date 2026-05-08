import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<any>;

interface Listing {
  id: string;
  title: string;
  price: number;
  price_unit?: string;
  avg_rating?: number;
  review_count?: number;
  images?: string[];
  vendor?: {
    id: string;
    name: string;
    avatar?: string;
  };
  category?: string;
}

const CATEGORIES = [
  { label: 'All', value: '' },
  { label: 'Wedding', value: 'Wedding' },
  { label: 'Photography', value: 'Photography' },
  { label: 'Music', value: 'Music' },
  { label: 'Catering', value: 'Catering' },
  { label: 'Decoration', value: 'Decoration' },
  { label: 'Video', value: 'Video' },
];

export default function CustomerHome() {
  const nav = useNavigation<Nav>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const load = useCallback(async (resetLoading = false) => {
    if (resetLoading) setLoading(true);
    try {
      const res = await api.get('/marketplace/listings', {
        params: {
          q: search || undefined,
          category: selectedCategory || undefined,
          limit: 20,
        },
      });
      if (res.data?.success) {
        setListings(res.data.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, selectedCategory]);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [search, selectedCategory]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderListing = ({ item }: { item: Listing }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => nav.navigate('ListingDetail', { listingId: item.id })}
    >
      {item.images && item.images.length > 0 ? (
        <Image source={{ uri: item.images[0] }} style={s.cardImage} resizeMode="cover" />
      ) : (
        <View style={[s.cardImage, s.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={36} color={COLORS.gray[400]} />
        </View>
      )}
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        {item.vendor && (
          <Text style={s.cardVendor} numberOfLines={1}>{item.vendor.name}</Text>
        )}
        <View style={s.cardFooter}>
          <Text style={s.cardPrice}>
            ${Number(item.price).toLocaleString()}
            {item.price_unit ? ` / ${item.price_unit}` : ''}
          </Text>
          {item.avg_rating != null && (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={s.ratingText}>
                {Number(item.avg_rating).toFixed(1)}
                {item.review_count ? ` (${item.review_count})` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.gray[400]} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search vendors, services..."
          placeholderTextColor={COLORS.gray[400]}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.gray[400]} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category pills */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryList}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[s.pill, selectedCategory === c.value && s.pillActive]}
            onPress={() => setSelectedCategory(c.value)}
          >
            <Text style={[s.pillText, selectedCategory === c.value && s.pillTextActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderListing}
          numColumns={2}
          columnWrapperStyle={s.columnWrapper}
          contentContainerStyle={[s.list, listings.length === 0 && s.listEmpty]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="storefront-outline" size={52} color={COLORS.gray[300]} />
              <Text style={s.emptyText}>No listings found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray[900],
    padding: 0,
  },
  categoryList: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  pillTextActive: { color: COLORS.white },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  listEmpty: { flex: 1 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardImage: {
    height: 110,
    backgroundColor: COLORS.gray[100],
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray[900], marginBottom: 2 },
  cardVendor: { fontSize: 12, color: COLORS.gray[500], marginBottom: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 11, color: COLORS.gray[600], fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 16, color: COLORS.gray[500], marginTop: 12 },
});
