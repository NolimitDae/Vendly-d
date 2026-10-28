import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandGradient, ScreenHeader } from '../../components/brand';
import TestBadge from '../../components/TestBadge';
import { DARK, FONTS } from '../../constants/colors';
import { MarketplaceService, type SavedListing, type SavedVendor } from '../../services/marketplace.service';

type Tab = 'vendors' | 'services';
const TABS: { key: Tab; label: string }[] = [
  { key: 'vendors', label: 'Vendors' },
  { key: 'services', label: 'Services' },
];

/** Favorites: the vendors and services (packages) the customer saved with the heart. */
export default function Favorites() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('vendors');
  const [vendors, setVendors] = useState<SavedVendor[] | null>(null);
  const [services, setServices] = useState<SavedListing[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      MarketplaceService.savedVendors().then((r) => setVendors(r.data?.data ?? [])).catch(() => setVendors((v) => v ?? [])),
      MarketplaceService.savedListings().then((r) => setServices(r.data?.data ?? [])).catch(() => setServices((v) => v ?? [])),
    ]).finally(() => setRefreshing(false));
  }, []);

  // reloads on return, so a heart tapped on a vendor's or package's page shows here
  useFocusEffect(load);

  // the vendor and package pages live on the Home tab
  const openVendor = (vendorId: string) => nav.navigate('HomeTab', { screen: 'VendorProfile', params: { vendorId }, initial: false });
  const openListing = (listingId: string) => nav.navigate('HomeTab', { screen: 'ListingDetail', params: { listingId }, initial: false });

  // optimistic: the row goes at once and comes back if the server says no
  const removeVendor = async (item: SavedVendor) => {
    setVendors((prev) => prev?.filter((v) => v.id !== item.id) ?? prev);
    try {
      await MarketplaceService.unsaveVendor(item.vendor.id);
    } catch {
      setVendors((prev) => (prev ? [...prev, item].sort((a, b) => b.created_at.localeCompare(a.created_at)) : prev));
    }
  };
  const removeService = async (item: SavedListing) => {
    setServices((prev) => prev?.filter((l) => l.id !== item.id) ?? prev);
    try {
      await MarketplaceService.unsave(item.listing.id);
    } catch {
      setServices((prev) => (prev ? [...prev, item].sort((a, b) => b.created_at.localeCompare(a.created_at)) : prev));
    }
  };

  const loading = (tab === 'vendors' ? vendors : services) === null;
  const header = (
    <View style={s.segment}>
      {TABS.map((t) => {
        const on = t.key === tab;
        const label = <Text style={[s.segmentText, on && { color: '#fff' }]}>{t.label}</Text>;
        return (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            {on ? <BrandGradient style={s.segmentItem}>{label}</BrandGradient> : <View style={s.segmentItem}>{label}</View>}
          </Pressable>
        );
      })}
    </View>
  );
  const empty = loading ? (
    <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
  ) : (
    <View style={s.empty}>
      <Ionicons name={tab === 'vendors' ? 'storefront-outline' : 'heart-outline'} size={40} color={DARK.accent} />
      <Text style={s.title}>{tab === 'vendors' ? 'No saved vendors yet' : 'No saved services yet'}</Text>
      <Text style={[s.muted, { textAlign: 'center' }]}>
        {tab === 'vendors' ? 'Open a vendor’s page and tap the heart to save them here.' : 'Tap the heart on any service to save it here.'}
      </Text>
    </View>
  );
  const listProps = {
    contentContainerStyle: { padding: 20, gap: 12 },
    ListHeaderComponent: header,
    ListEmptyComponent: empty,
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />,
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <ScreenHeader title="Favorites" onBack={() => nav.goBack()} />
      {tab === 'vendors' ? (
        <FlatList
          {...listProps}
          data={vendors ?? []}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => {
            const v = item.vendor;
            const name = v.business_name || v.name;
            const mark = v.logo_url || v.avatar_url;
            return (
              <Pressable style={s.card} onPress={() => openVendor(v.id)} accessibilityRole="button" accessibilityLabel={name}>
                <View style={s.thumb}>
                  {mark ? <Image source={{ uri: mark }} style={StyleSheet.absoluteFill} /> : <Text style={s.initial}>{(name[0] ?? 'V').toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.meta}>
                    <Text style={[s.title, { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
                    {v.is_test && <TestBadge />}
                  </View>
                  <Text style={s.muted} numberOfLines={1}>{v.categories.join(', ') || 'Vendor'}</Text>
                  <View style={s.meta}>
                    <Ionicons name="star" size={14} color="#F5B700" />
                    <Text style={s.muted}>
                      {v.avg_rating != null ? Number(v.avg_rating).toFixed(1) : 'New'} ({v.review_count} {v.review_count === 1 ? 'review' : 'reviews'})
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => removeVendor(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${name} from favorites`}>
                  <Ionicons name="heart" size={24} color="#E0479E" />
                </Pressable>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          {...listProps}
          data={services ?? []}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => {
            const l = item.listing;
            return (
              <Pressable style={s.card} onPress={() => openListing(l.id)} accessibilityRole="button" accessibilityLabel={l.title}>
                <View style={s.thumb}>
                  {l.images?.[0] ? <Image source={{ uri: l.images[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="image-outline" size={24} color={DARK.muted} />}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={1}>{l.title}</Text>
                  {!!l.vendor && <Text style={s.muted} numberOfLines={1}>{l.vendor.vendorProfile?.business_name || l.vendor.name}</Text>}
                  <Text style={s.price}>
                    ${Number(l.price).toLocaleString()}
                    {!!l.price_unit && <Text style={s.muted}> / {l.price_unit}</Text>}
                  </Text>
                </View>
                <Pressable onPress={() => removeService(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${l.title} from favorites`}>
                  <Ionicons name="heart" size={24} color="#E0479E" />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 100, backgroundColor: DARK.card, marginBottom: 8 },
  segmentItem: { height: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium, paddingHorizontal: 4 },
  empty: { alignItems: 'center', gap: 8, padding: 28, backgroundColor: DARK.card, borderRadius: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: DARK.card, borderRadius: 16, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 22, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  price: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
});
