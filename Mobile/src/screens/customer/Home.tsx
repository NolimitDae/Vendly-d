import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DARK, FONTS } from '../../constants/colors';
import { BrandGradient, PressableScale } from '../../components/brand';
import { haptic } from '../../utils/haptics';
import { ListingCardSkeleton } from '../../components/Skeleton';
import { useFeature } from '../../hooks/useFeature';
import { useAuth } from '../../context/AuthContext';
import { useNearMe } from '../../hooks/useNearMe';
import { api } from '../../services/api';
import ReviewPrompt from '../../components/ReviewPrompt';

type Nav = NativeStackNavigationProp<any>;
type IconName = keyof typeof Ionicons.glyphMap;

interface Listing {
  id: string;
  title: string;
  price: number;
  price_unit?: string;
  avg_rating?: number | null;
  images?: string[];
  location?: string | null;
  distance_miles?: number | null;
  vendor?: { id: string; name: string; vendorProfile?: { business_name?: string | null } | null } | null;
}

interface Category {
  id: string;
  name: string;
}

// Icons for the category names the admin has set up (most specific first); anything else gets a generic one.
const CATEGORY_ICONS: [RegExp, IconName][] = [
  [/music|entertain|dj|band|perform/i, 'musical-notes-outline'],
  [/photo|video|film|camera|media/i, 'camera-outline'],
  [/cater|food|bev|drink|bak|cake|dessert|chef/i, 'restaurant-outline'],
  [/venue|space|hall|location/i, 'business-outline'],
  [/decor|floral|flower|design/i, 'flower-outline'],
  [/beauty|glam|hair|makeup|nail|personal/i, 'sparkles-outline'],
  [/officiant|ceremony|minister|vow/i, 'heart-outline'],
  [/kid|family|child|party/i, 'happy-outline'],
  [/station|gift|invite|print|favou?r/i, 'gift-outline'],
  [/transport|car|limo|bus|shuttle|valet/i, 'car-sport-outline'],
  [/staff|service|security|bartend|clean/i, 'people-outline'],
  [/rental|equipment|tent|furniture/i, 'cube-outline'],
  [/event|planning|planner|wedding|coordinat/i, 'calendar-outline'],
];
const iconFor = (name: string): IconName => CATEGORY_ICONS.find(([re]) => re.test(name))?.[1] ?? 'pricetags-outline';

const MAX_TILES = 6;
const NEAR_RADIUS = 25;

export default function CustomerHome() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const rentalsOn = useFeature('rentals');
  const nearMe = useNearMe();
  const [nearby, setNearby] = useState<Listing[] | null>(null);

  // Services close to the phone, once location is on
  useEffect(() => {
    if (!nearMe.coords) return;
    api
      .get('/marketplace/listings', {
        params: { near_lat: nearMe.coords.lat, near_lng: nearMe.coords.lng, radius_miles: NEAR_RADIUS, sort: 'distance', limit: 10 },
      })
      .then((res) => setNearby(res.data?.data ?? []))
      .catch(() => setNearby([]));
  }, [nearMe.coords?.lat, nearMe.coords?.lng]);

  const nearFilters = nearMe.coords
    ? { near_lat: nearMe.coords.lat, near_lng: nearMe.coords.lng, radius_miles: NEAR_RADIUS, sort: 'distance' as const }
    : undefined;

  useEffect(() => {
    api
      .get('/marketplace/categories')
      .then((res) => setCategories(res.data?.data ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/marketplace/listings', { params: { sort: 'rating', limit: 10 } });
      if (res.data?.success) setListings(res.data.data ?? []);
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

  const firstName = (user?.name ?? '').split(' ')[0];
  const tiles = showAll ? categories : categories.slice(0, MAX_TILES);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />
      }
    >
      {/* Greeting */}
      <View style={s.header}>
        <View style={s.greeting}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={s.avatar} />
          ) : (
            <BrandGradient style={[s.avatar, s.center]}>
              <Text style={s.initial}>{(firstName[0] ?? 'V').toUpperCase()}</Text>
            </BrandGradient>
          )}
          <View style={{ flexShrink: 1 }}>
            <Text style={s.hello} numberOfLines={1}>Hello {firstName || 'there'}!</Text>
            <Text style={s.helloSub}>What are you planning today?</Text>
          </View>
        </View>
        <Pressable
          style={s.bell}
          onPress={() => nav.navigate('Notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Search */}
      <View style={s.search}>
        <Ionicons name="search-outline" size={20} color={DARK.muted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search services & vendors"
          placeholderTextColor={DARK.muted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => search.trim() && nav.navigate('SearchResults', { q: search.trim() })}
          returnKeyType="search"
        />
        <Pressable onPress={() => nav.navigate('FindVendors')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Search filters">
          <Ionicons name="options-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* "How was it?" for a finished booking that hasn't been rated */}
      <ReviewPrompt style={{ marginHorizontal: 20, marginTop: 16 }} />

      {/* Banner: brand promise rather than Figma's $20-off promo, since there are no promo codes yet */}
      <BrandGradient style={s.banner}>
        <Image source={require('../../../assets/home/promo-wave.jpg')} style={[StyleSheet.absoluteFill, { opacity: 0.2 }]} resizeMode="cover" />
        <View style={s.bannerText}>
          <Text style={s.bannerKicker}>Plan with confidence</Text>
          <Text style={s.bannerTitle}>Book trusted pros</Text>
          <Text style={s.bannerBody}>Signed contracts and protected payments on every booking</Text>
        </View>
        <View style={s.bannerPhoto}>
          <Image source={require('../../../assets/home/promo-model.png')} style={s.bannerPhotoImg} resizeMode="cover" />
        </View>
      </BrandGradient>

      {/* Categories */}
      {categories.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Categories</Text>
          <View style={s.grid}>
            {tiles.map((c) => {
              return (
                <PressableScale
                  key={c.id}
                  onPress={() => {
                    haptic.select();
                    nav.navigate('SearchResults', { categoryId: c.id, categoryName: c.name });
                  }}
                  accessibilityRole="button"
                  style={s.tileWrap}
                >
                  <View style={s.tile}>
                    <Ionicons name={iconFor(c.name)} size={30} color={DARK.accent} />
                    <Text style={s.tileText} numberOfLines={3}>{c.name}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
          {categories.length > MAX_TILES && (
            <Pressable style={s.others} onPress={() => setShowAll(!showAll)} accessibilityRole="button">
              <Ionicons name={showAll ? 'chevron-up' : 'grid-outline'} size={24} color={DARK.muted} />
              <Text style={s.othersText}>{showAll ? 'Show less' : 'Others'}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Rentals (Admin can switch the feature off) */}
      {rentalsOn && <PressableScale style={s.rentals} onPress={() => nav.navigate('Rentals')} accessibilityRole="button" accessibilityLabel="Browse rentals">
        <View style={s.rentalsIcon}>
          <Ionicons name="cube-outline" size={26} color={DARK.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rentalsTitle}>Rent decor & equipment</Text>
          <Text style={s.rentalsBody}>Chairs, arches, lighting and AV by the day, with live stock</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={DARK.muted} />
      </PressableScale>}

      {/* Near you: asks for location, then lists the closest services */}
      {nearMe.status === 'on' ? (
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Near you</Text>
            <Pressable onPress={() => nav.navigate('SearchResults', { filters: nearFilters })} hitSlop={8} accessibilityRole="link" accessibilityLabel="See all services near you">
              <Text style={s.seeAll}>See all</Text>
            </Pressable>
          </View>
          {nearby === null ? (
            <View style={{ flexDirection: 'row', gap: 12, marginRight: -20, overflow: 'hidden' }}>
              <ListingCardSkeleton />
              <ListingCardSkeleton />
            </View>
          ) : nearby.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="navigate-outline" size={36} color={DARK.muted} />
              <Text style={s.emptyText}>No services within {NEAR_RADIUS} miles yet</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={nearby}
              keyExtractor={(l) => l.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingRight: 20 }}
              style={{ marginRight: -20 }}
              renderItem={({ item }) => <ServiceCard item={item} onPress={() => nav.navigate('ListingDetail', { listingId: item.id })} />}
            />
          )}
        </View>
      ) : (nearMe.status === 'ask' || nearMe.status === 'denied' || nearMe.status === 'error' || nearMe.status === 'locating') && !nearMe.dismissed ? (
        <View style={s.locate}>
          <View style={s.rentalsIcon}>
            <Ionicons name="navigate" size={24} color={DARK.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rentalsTitle}>Find vendors near you</Text>
            <Text style={s.rentalsBody}>
              {nearMe.status === 'denied'
                ? nearMe.canAskAgain
                  ? 'Allow location to see services closest to you first.'
                  : 'Location is off for Vendly. Turn it on in Settings to see services near you.'
                : nearMe.status === 'error'
                  ? 'We couldn’t get your location. Try again.'
                  : 'Share your location to see services closest to you first.'}
            </Text>
            <View style={s.locateActions}>
              <Pressable
                style={s.locateBtn}
                onPress={() => (nearMe.status === 'error' ? nearMe.retry() : nearMe.ask())}
                disabled={nearMe.status === 'locating'}
                accessibilityRole="button"
              >
                {nearMe.status === 'locating' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.locateBtnText}>
                    {nearMe.status === 'denied' && !nearMe.canAskAgain ? 'Open Settings' : nearMe.status === 'error' ? 'Try again' : 'Turn on location'}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={nearMe.dismiss} hitSlop={8} accessibilityRole="button">
                <Text style={s.locateLater}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Services */}
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Popular Services</Text>
          <Pressable onPress={() => nav.navigate('SearchResults', {})} hitSlop={8} accessibilityRole="link">
            <Text style={s.seeAll}>See all</Text>
          </Pressable>
        </View>
        {loading ? (
          <View style={{ flexDirection: 'row', gap: 12, marginRight: -20, overflow: 'hidden' }}>
            <ListingCardSkeleton />
            <ListingCardSkeleton />
          </View>
        ) : listings.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="storefront-outline" size={40} color={DARK.muted} />
            <Text style={s.emptyText}>No services listed yet</Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={listings}
            keyExtractor={(l) => l.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 20 }}
            style={{ marginRight: -20 }}
            renderItem={({ item }) => <ServiceCard item={item} onPress={() => nav.navigate('ListingDetail', { listingId: item.id })} />}
          />
        )}
      </View>
    </ScrollView>
  );
}

function ServiceCard({ item, onPress }: { item: Listing; onPress: () => void }) {
  const vendor = item.vendor?.vendorProfile?.business_name || item.vendor?.name;
  return (
    <PressableScale style={s.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={item.title}>
      <View style={s.cardImage}>
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={32} color={DARK.muted} />
        )}
        <View style={s.price}>
          <Text style={s.priceText}>
            ${Number(item.price).toLocaleString()}
            {item.price_unit && item.price_unit !== 'fixed' ? ` / ${item.price_unit}` : ''}
          </Text>
        </View>
      </View>
      <View style={s.cardTitleRow}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        {item.avg_rating != null && (
          <View style={s.rating}>
            <Ionicons name="star" size={14} color="#F5B700" />
            <Text style={s.ratingText}>{Number(item.avg_rating).toFixed(1)}</Text>
          </View>
        )}
      </View>
      {!!vendor && (
        <View style={s.meta}>
          <Ionicons name="storefront-outline" size={14} color={DARK.muted} />
          <Text style={s.metaText} numberOfLines={1}>{vendor}</Text>
        </View>
      )}
      {(!!item.location || item.distance_miles != null) && (
        <View style={s.meta}>
          <Ionicons name="location-outline" size={14} color={DARK.muted} />
          <Text style={s.metaText} numberOfLines={1}>
            {item.distance_miles != null ? `${item.distance_miles < 1 ? 'Under 1' : item.distance_miles} mi away${item.location ? ' · ' : ''}` : ''}
            {item.location}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 12 },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  initial: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  hello: { color: '#fff', fontSize: 20, lineHeight: 26, fontFamily: FONTS.semibold },
  helloSub: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.regular },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 99,
    backgroundColor: DARK.field,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: FONTS.regular, paddingVertical: 0 },
  banner: { marginHorizontal: 20, marginTop: 24, height: 165, borderRadius: 20, overflow: 'hidden', flexDirection: 'row' },
  bannerText: { flex: 1, justifyContent: 'center', paddingLeft: 20, paddingRight: 8, gap: 6 },
  bannerKicker: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  bannerTitle: { color: '#fff', fontSize: 22, lineHeight: 28, fontFamily: FONTS.bold },
  bannerBody: { color: '#fff', fontSize: 13, lineHeight: 18, fontFamily: FONTS.medium, opacity: 0.92 },
  // Crop of the Figma banner photo: the model sits in the left third of a wide image.
  bannerPhoto: { width: 117, height: 154, alignSelf: 'flex-end', marginRight: 18, overflow: 'hidden' },
  bannerPhotoImg: { position: 'absolute', top: 0, left: '-8%', width: '271%', height: '100%' },
  section: { marginTop: 24, paddingHorizontal: 20, gap: 16 },
  rentals: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 24, padding: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.field },
  rentalsIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  rentalsTitle: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  rentalsBody: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.regular },
  sectionTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  locate: { flexDirection: 'row', gap: 14, marginHorizontal: 20, marginTop: 24, padding: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.field },
  locateActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  locateBtn: { minHeight: 36, minWidth: 120, paddingHorizontal: 14, borderRadius: 99, backgroundColor: DARK.accent, alignItems: 'center', justifyContent: 'center' },
  locateBtnText: { color: '#fff', fontSize: 13, fontFamily: FONTS.semibold },
  locateLater: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.medium },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 12 },
  tileWrap: { width: '33.333%', paddingHorizontal: 6 },
  tile: {
    height: 104,
    borderRadius: 12,
    backgroundColor: DARK.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  tileText: { color: DARK.muted, fontSize: 12, lineHeight: 17, fontFamily: FONTS.medium, textAlign: 'center' },
  others: {
    marginTop: -4,
    height: 56,
    borderRadius: 12,
    backgroundColor: DARK.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  othersText: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 10, backgroundColor: DARK.card, borderRadius: 16 },
  emptyText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  card: { width: 243, padding: 12, borderRadius: 16, backgroundColor: DARK.card, gap: 4 },
  cardImage: {
    height: 121,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: DARK.field,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  price: { position: 'absolute', top: 8, left: 8, backgroundColor: '#F6F8FA', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  priceText: { color: '#030303', fontSize: 11, fontFamily: FONTS.semibold },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.semibold },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, color: DARK.muted, fontSize: 12, lineHeight: 19, fontFamily: FONTS.regular },
});
