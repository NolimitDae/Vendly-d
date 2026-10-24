import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BrandGradient, ScreenHeader } from '../../components/brand';
import { DARK, FONTS } from '../../constants/colors';
import { api } from '../../services/api';
import type { VendorDashboardStackParams } from '../../navigation/types';
import LicenceNotice from '../../components/LicenceNotice';

interface Listing {
  id: string;
  title: string;
  description?: string;
  price: number;
  price_unit?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  images?: string[];
  category?: { id: string; name: string } | null;
  avg_rating?: number | null;
  _count?: { reviews?: number; bookings?: number };
}

const STATUS: Record<Listing['status'], { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: '#6ee7c7' },
  PAUSED: { label: 'Paused', color: '#fcd34d' },
  DRAFT: { label: 'Draft', color: DARK.muted },
  ARCHIVED: { label: 'Archived', color: DARK.muted },
};

export default function VendorListings() {
  const nav = useNavigation<NativeStackNavigationProp<VendorDashboardStackParams>>();
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/vendor/listings', { params: { limit: 100 } });
      if (res.data?.success) setListings(res.data.data ?? []);
    } catch {
      // keep what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (l: Listing) => {
    // Statuses are DRAFT / ACTIVE / PAUSED / ARCHIVED; pause only applies to a live listing.
    const live = l.status === 'ACTIVE';
    try {
      const res = await api.patch(`/vendor/listings/${l.id}/${live ? 'pause' : 'publish'}`);
      setListings((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: res.data?.data?.status ?? (live ? 'PAUSED' : 'ACTIVE') } : x)));
    } catch (err: any) {
      // e.g. the business licence isn't approved yet
      Alert.alert(live ? 'Could not update' : 'Could not publish', err?.response?.data?.message ?? 'Try again in a moment.');
    }
  };

  const remove = (l: Listing) =>
    Alert.alert('Delete this package?', `"${l.title}" will no longer be bookable. Existing bookings are kept.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/vendor/listings/${l.id}`);
            setListings((prev) => prev.filter((x) => x.id !== l.id));
          } catch (err: any) {
            Alert.alert('Could not delete', err?.response?.data?.message ?? 'Try again in a moment.');
          }
        },
      },
    ]);

  return (
    <View style={s.root}>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100, gap: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={DARK.accent} />}
        ListHeaderComponent={
          <View style={{ gap: 20 }}>
            <ScreenHeader title="Packages" onBack={() => nav.goBack()} />
            <View style={{ paddingHorizontal: 20, gap: 6 }}>
              <Text style={s.h2}>Manage Your Packages</Text>
              <Text style={s.body}>Everything customers can book from you. Pause a package to hide it, or block dates when you're busy.</Text>
            </View>
            <LicenceNotice style={{ marginHorizontal: 20 }} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={DARK.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="albums-outline" size={44} color={DARK.muted} />
              <Text style={s.emptyTitle}>No packages yet</Text>
              <Text style={s.body}>Add your first package so customers can find and book you.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const st = STATUS[item.status] ?? STATUS.DRAFT;
          return (
            <View style={s.card}>
              <View style={s.photo}>
                {item.images?.[0] ? <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={40} color={DARK.muted} />}
              </View>
              <View style={s.rowBetween}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <View style={s.pill}>
                  <View style={[s.dot, { backgroundColor: st.color }]} />
                  <Text style={s.pillText}>{st.label}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={s.chip}><Text style={s.chipText}>{item.category?.name ?? 'Uncategorised'}</Text></View>
                <View style={s.chip}><Text style={s.chipText}>${Number(item.price).toLocaleString()}{item.price_unit && item.price_unit !== 'fixed' ? ` / ${item.price_unit}` : ''}</Text></View>
              </View>
              {!!item.description && <Text style={s.desc} numberOfLines={2}>{item.description}</Text>}
              <View style={s.statsRow}>
                <Ionicons name="star" size={18} color="#F5B700" />
                <Text style={s.stat}>{item.avg_rating != null ? Number(item.avg_rating).toFixed(1) : 'New'} <Text style={s.statMuted}>({item._count?.reviews ?? 0})</Text></Text>
                <View style={s.vline} />
                <Ionicons name="calendar-outline" size={18} color={DARK.accent} />
                <Text style={s.stat}>{item._count?.bookings ?? 0} <Text style={s.statMuted}>bookings</Text></Text>
              </View>
              <View style={s.actions}>
                <Pressable style={s.secondary} onPress={() => remove(item)} accessibilityRole="button"><Text style={s.secondaryText}>Delete</Text></Pressable>
                <Pressable style={s.secondary} onPress={() => toggle(item)} accessibilityRole="button"><Text style={s.secondaryText}>{item.status === 'ACTIVE' ? 'Pause' : 'Publish'}</Text></Pressable>
                <Pressable style={s.secondary} onPress={() => nav.navigate('Availability', { listingId: item.id, title: item.title })} accessibilityRole="button"><Text style={s.secondaryText}>Dates</Text></Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('ListingForm', { listingId: item.id })} accessibilityRole="button">
                  <BrandGradient style={s.primary}><Text style={s.primaryText}>Edit</Text></BrandGradient>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      <Pressable style={[s.fab, { bottom: insets.bottom + 24 }]} onPress={() => nav.navigate('ListingForm')} accessibilityRole="button" accessibilityLabel="Add package">
        <BrandGradient style={s.fabInner}><Ionicons name="add" size={32} color="#fff" /></BrandGradient>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  h2: { color: '#fff', fontSize: 20, fontFamily: FONTS.medium },
  body: { color: '#fff', fontSize: 15, lineHeight: 23, fontFamily: FONTS.regular },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  card: { marginHorizontal: 20, padding: 12, borderRadius: 20, backgroundColor: DARK.card, gap: 12 },
  photo: { height: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: DARK.field },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: DARK.field },
  chipText: { color: '#fff', fontSize: 12, fontFamily: FONTS.medium },
  desc: { color: '#fff', fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: DARK.field },
  stat: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
  statMuted: { color: DARK.muted, fontFamily: FONTS.regular },
  vline: { width: 1, height: 16, backgroundColor: DARK.field, marginHorizontal: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  secondary: { height: 46, paddingHorizontal: 14, borderRadius: 100, backgroundColor: DARK.field, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  primary: { height: 46, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  fab: { position: 'absolute', right: 20 },
  fabInner: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
