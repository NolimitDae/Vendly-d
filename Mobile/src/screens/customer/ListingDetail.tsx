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
import { useAuth } from '../../context/AuthContext';
import { rangeText, unitSuffix, type AddOn } from '../../services/addons.service';
import { summariseHours, withZone } from '../../utils/workingHours';
import { noticeLine } from '../../utils/packageDetails';
import { DEPOSIT_RULE_TEXT, isDepositPlan } from '../../utils/bookingStatus';
import TestBadge from '../../components/TestBadge';

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
  minNoticeHours: l.min_notice_hours ?? null,
});

export default function ListingDetail({ navigation, route }: NativeStackScreenProps<CustomerHomeStackParams, 'ListingDetail'>) {
  const { listingId, eventId } = route.params;
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const saved = useSaved();
  const { user } = useAuth();

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
  const unit = unitSuffix(listing.price_unit);
  const range = rangeText(listing.price_unit, listing.min_quantity, listing.max_quantity);
  const addOns = listing.add_ons ?? [];
  const fees = listing.fees ?? [];
  const isMine = !!user?.id && listing.vendor?.id === user.id;

  return (
    <View style={s.root}>
      {/* room for the whole bottom bar (question bubble + Book button), so nothing hides behind it */}
      <ScrollView contentContainerStyle={{ paddingBottom: (footerHeight || insets.bottom + 170) + 16 }}>
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
              {listing.is_test && <TestBadge />}
              <Text style={s.price}>
                ${Number(listing.price).toLocaleString()}
                <Text style={s.unit}>{unit}</Text>
                {!!range && <Text style={s.unit}>{` · ${range}`}</Text>}
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

          {!!listing.included_items?.length && (
            <Card style={{ gap: 10 }}>
              <Text style={s.cardTitle}>What’s included</Text>
              {listing.included_items.map((item, i) => (
                <View key={i} style={s.included}>
                  <Ionicons name="checkmark-circle" size={18} color={DARK.accent} />
                  <Text style={[s.body, { flex: 1 }]}>{item}</Text>
                </View>
              ))}
            </Card>
          )}

          {!!noticeLine(listing.min_notice_hours) && (
            <View style={s.included}>
              <Ionicons name="calendar-outline" size={18} color={DARK.accent} />
              <Text style={s.muted}>{noticeLine(listing.min_notice_hours)}</Text>
            </View>
          )}

          {addOns.length > 0 && (
            <Card style={{ gap: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={s.cardTitle}>Add-ons</Text>
                <Text style={s.muted}>Pick any of these when you book.</Text>
              </View>
              {addOns.map((a) => <AddOnLine key={a.id} item={a} />)}
            </Card>
          )}

          {fees.length > 0 && (
            <Card style={{ gap: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={s.cardTitle}>Possible fees after the service</Text>
                <Text style={s.muted}>Each is only charged if it applies, and only after you approve it.</Text>
              </View>
              {fees.map((a) => <AddOnLine key={a.id} item={a} />)}
            </Card>
          )}

          {!!listing.working_hours && (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time-outline" size={18} color={DARK.accent} />
                <Text style={s.cardTitle}>Working hours</Text>
              </View>
              <Text style={s.muted}>Works {withZone(listing.working_hours_summary ?? summariseHours(listing.working_hours) ?? '', listing.working_hours)}</Text>
            </Card>
          )}

          {!!listing.cancellation_policy && (
            <Card style={{ gap: 6 }}>
              <Text style={s.cardTitle}>Cancellation policy: {listing.cancellation_policy.label}</Text>
              <Text style={s.muted}>{listing.cancellation_policy.text}</Text>
              {isDepositPlan(listing.effective_payment_plan) && <Text style={[s.muted, { color: '#fcd34d' }]}>{DEPOSIT_RULE_TEXT}</Text>}
              <Text style={s.muted}>The Vendly Protection fee isn’t refunded when you cancel. If the vendor cancels, you get everything back.</Text>
            </Card>
          )}

          <Card>
            {!!listing.category && <Row label="Category" value={[listing.category.name, listing.sub_category?.name].filter(Boolean).join(' · ')} />}
            {listing.delivery_time != null && <Row label="Delivery time" value={`${listing.delivery_time} day${listing.delivery_time === 1 ? '' : 's'}`} />}
            {!!listing.location && <Row label="Location" value={listing.location} />}
            {!!listing.service_radius_miles && <Row label="Travels" value={`Up to ${listing.service_radius_miles} miles`} />}
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

      {/* nothing behind the buttons: the page shows through and scrolls under them; taps between them reach the page */}
      <View
        style={[s.footer, { paddingBottom: insets.bottom + 20 }]}
        pointerEvents="box-none"
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      >
        {isMine ? (
          // one login, several roles: your own package, seen from your customer side
          <View style={s.mine}>
            <Ionicons name="storefront-outline" size={18} color={DARK.accent} />
            <Text style={s.mineText}>This is your package. This is how customers see it; you can’t book or message yourself.</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'flex-end', marginBottom: 14 }} pointerEvents="box-none">
              <ChatBubble onPress={() => openChatWith(navigation, listing.vendor.id, vendor)} />
            </View>
            <GradientButton title={eventId ? 'Book for this event' : 'Book Service'} onPress={() => navigation.navigate('SelectDate', { listing: { ...toSummary(listing), eventId } })} />
          </>
        )}
      </View>
    </View>
  );
}

function AddOnLine({ item }: { item: AddOn }) {
  return (
    <View style={s.addOn} accessible accessibilityLabel={`${item.name}, ${item.price_text}${item.description ? `. ${item.description}` : ''}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.addOnName}>{item.name}</Text>
        {!!item.description && <Text style={s.muted}>{item.description}</Text>}
      </View>
      <Text style={s.addOnPrice}>{item.price_text}{item.max_quantity ? `\nup to ${item.max_quantity}` : ''}</Text>
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
  included: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  addOn: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: DARK.field },
  addOnName: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  addOnPrice: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold, textAlign: 'right' },
  rowLabel: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.medium },
  rowValue: { color: '#fff', fontSize: 14, lineHeight: 22, fontFamily: FONTS.semibold, flexShrink: 1 },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: DARK.card },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  vendorName: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 8 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: DARK.card, borderWidth: 1, borderColor: DARK.border },
  mineText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.medium },
});
