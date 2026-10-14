import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandGradient, Card, ChatBubble, GradientButton, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { useSaved } from '../../hooks/useSaved';
import { openChatWith } from '../../navigation/openChat';
import { MarketplaceService, vendorName, type Listing } from '../../services/marketplace.service';
import type { CustomerHomeStackParams, ListingSummary } from '../../navigation/types';

export const toSummary = (l: Listing): ListingSummary => ({
  id: l.id,
  title: l.title,
  price: Number(l.price),
  priceUnit: l.price_unit,
  image: l.images?.[0],
  vendorId: l.vendor.id,
  vendorName: vendorName(l.vendor),
  rating: l.avg_rating ?? null,
  reviewCount: l._count?.reviews ?? l.reviews?.length ?? 0,
});

export default function ListingDetail({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'ListingDetail'>) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const saved = useSaved();

  useEffect(() => {
    MarketplaceService.getListing(listingId)
      .then((r) => setListing(r.data?.data ?? null))
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <ActivityIndicator color={DARK.accent} style={s.center} />;
  if (!listing) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.body}>This service is no longer available</Text>
      </View>
    );
  }

  const images = listing.images ?? [];
  const reviews = listing._count?.reviews ?? listing.reviews?.length ?? 0;
  const vendor = vendorName(listing.vendor);
  const unit = listing.price_unit && listing.price_unit !== 'fixed' ? ` / ${listing.price_unit}` : '';

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={s.hero}>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height: 315 }} resizeMode="cover" />}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.center]}>
              <Ionicons name="image-outline" size={48} color={DARK.muted} />
            </View>
          )}
          <View style={[s.heroBar, { top: insets.top + 12 }]} pointerEvents="box-none">
            <ScreenHeader
              title="Details"
              onBack={() => navigation.goBack()}
              light
              right={
                <Pressable onPress={() => saved.toggle(listing.id)} style={s.heart} accessibilityRole="button" accessibilityLabel="Save">
                  <Ionicons name={saved.has(listing.id) ? 'heart' : 'heart-outline'} size={20} color={saved.has(listing.id) ? '#E0479E' : DARK.bg} />
                </Pressable>
              }
            />
          </View>
          {images.length > 1 && (
            <View style={s.dots}>
              {images.map((_, i) => (i === slide ? <BrandGradient key={i} style={s.dot} /> : <View key={i} style={[s.dot, { backgroundColor: '#fff' }]} />))}
            </View>
          )}
        </View>

        <View style={s.content}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={s.h1}>{listing.title}</Text>
              <Text style={s.price}>
                ${Number(listing.price).toLocaleString()}
                <Text style={s.unit}>{unit}</Text>
              </Text>
            </View>
            <Pressable
              style={s.meta}
              onPress={() => navigation.navigate('Reviews', { listingId: listing.id, title: listing.title })}
              accessibilityRole="link"
              accessibilityLabel={`${reviews} reviews`}
              hitSlop={8}
            >
              <Ionicons name="star" size={16} color="#F5B700" />
              <Text style={s.muted}>
                {listing.avg_rating != null ? Number(listing.avg_rating).toFixed(1) : 'New'} ({reviews} Reviews)
              </Text>
            </Pressable>
          </View>

          {!!listing.description && (
            <Card>
              <Text style={s.cardTitle}>Description</Text>
              <Text style={s.body}>{listing.description}</Text>
            </Card>
          )}

          <Card>
            {!!listing.category && <Row label="Category" value={[listing.category.name, listing.sub_category?.name].filter(Boolean).join(' · ')} />}
            {listing.delivery_time != null && <Row label="Delivery time" value={`${listing.delivery_time} day${listing.delivery_time === 1 ? '' : 's'}`} />}
            {!!listing.location && <Row label="Location" value={listing.location} />}
            <Row label="Payment" value="Held by Vendly until done" />
          </Card>

          <Pressable style={s.vendorRow} onPress={() => navigation.push('VendorProfile', { vendorId: listing.vendor.id })} accessibilityRole="button">
            <View style={s.avatar}>
              {listing.vendor.avatar_url ? (
                <Image source={{ uri: listing.vendor.avatar_url }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={s.avatarText}>{vendor[0]?.toUpperCase() ?? 'V'}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.vendorName}>{vendor}</Text>
              <Text style={s.muted}>View vendor profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={{ alignItems: 'flex-end', marginBottom: 14 }}>
          <ChatBubble onPress={() => openChatWith(navigation, listing.vendor.id, vendor)} />
        </View>
        <GradientButton title="Book Service" onPress={() => navigation.navigate('SelectDate', { listing: toSummary(listing) })} />
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DARK.bg },
  hero: { height: 315, backgroundColor: DARK.card },
  heroBar: { position: 'absolute', left: 0, right: 0 },
  heart: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  h1: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  price: { color: DARK.accent, fontSize: 18, fontFamily: FONTS.semibold },
  unit: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  muted: { color: DARK.muted, fontSize: 14, fontFamily: FONTS.medium },
  body: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.regular },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  rowLabel: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium },
  rowValue: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.semibold, flexShrink: 1 },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: DARK.card },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  vendorName: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8, backgroundColor: DARK.bg },
});
