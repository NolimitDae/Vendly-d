import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { VendorListingsStackParams } from '../../navigation/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  status: string;
  _count: { bookings: number };
}

type Nav = NativeStackNavigationProp<VendorListingsStackParams>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function VendorListings() {
  const nav = useNavigation<Nav>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/vendor/listings');
      if (res.data?.success) setListings(res.data.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Delete Listing',
      `Are you sure you want to delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/vendor/listings/${id}`);
              setListings((prev) => prev.filter((l) => l.id !== id));
            } catch {
              Alert.alert('Error', 'Failed to delete listing. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleTogglePublish = async (listing: Listing) => {
    if (togglingId === listing.id) return;
    setTogglingId(listing.id);
    try {
      const res = await api.patch(`/vendor/listings/${listing.id}/publish`);
      if (res.data?.success) {
        setListings((prev) =>
          prev.map((l) => (l.id === listing.id ? { ...l, status: res.data.data?.status ?? (l.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED') } : l)),
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to update listing status.');
    } finally {
      setTogglingId(null);
    }
  };

  const renderItem = ({ item }: { item: Listing }) => {
    const isPublished = item.status === 'PUBLISHED';
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => nav.navigate('ListingForm', { listingId: item.id })}
        activeOpacity={0.85}
      >
        <View style={s.cardHeader}>
          <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
          <View style={[s.badge, isPublished ? s.badgePublished : s.badgeDraft]}>
            <Text style={[s.badgeText, isPublished ? s.badgePublishedText : s.badgeDraftText]}>
              {isPublished ? 'Published' : 'Draft'}
            </Text>
          </View>
        </View>

        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Ionicons name="cash-outline" size={13} color={COLORS.gray[400]} />
            <Text style={s.metaText}>
              ${Number(item.price).toLocaleString()} / {item.price_unit}
            </Text>
          </View>
          <View style={s.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={COLORS.gray[400]} />
            <Text style={s.metaText}>{item._count?.bookings ?? 0} bookings</Text>
          </View>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => nav.navigate('ListingForm', { listingId: item.id })}
          >
            <Ionicons name="create-outline" size={16} color={COLORS.primary} />
            <Text style={s.actionBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnSecondary]}
            onPress={() => handleTogglePublish(item)}
            disabled={togglingId === item.id}
          >
            {togglingId === item.id ? (
              <ActivityIndicator size="small" color={COLORS.gray[600]} />
            ) : (
              <>
                <Ionicons
                  name={isPublished ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={COLORS.gray[600]}
                />
                <Text style={[s.actionBtnText, { color: COLORS.gray[600] }]}>
                  {isPublished ? 'Unpublish' : 'Publish'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnDanger]}
            onPress={() => handleDelete(item.id, item.title)}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={[s.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, listings.length === 0 && s.listEmpty]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <View style={s.listHeader}>
              <Text style={s.listHeaderText}>My Listings ({listings.length})</Text>
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => nav.navigate('ListingForm', { listingId: undefined })}
              >
                <Ionicons name="add" size={18} color={COLORS.white} />
                <Text style={s.addBtnText}>Add Listing</Text>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="storefront-outline" size={56} color={COLORS.gray[300]} />
              <Text style={s.emptyTitle}>No listings yet</Text>
              <Text style={s.emptyText}>Create your first listing to start receiving bookings</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => nav.navigate('ListingForm', { listingId: undefined })}
              >
                <Text style={s.emptyBtnText}>Create Listing</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  listEmpty: { flex: 1 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listHeaderText: { fontSize: 16, fontWeight: '700', color: COLORS.gray[800] },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray[900], flex: 1, marginRight: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgePublished: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  badgeDraft: { backgroundColor: COLORS.gray[100], borderColor: COLORS.gray[300] },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgePublishedText: { color: '#15803d' },
  badgeDraftText: { color: COLORS.gray[500] },
  cardMeta: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.gray[500] },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: COLORS.gray[100], paddingTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnSecondary: { backgroundColor: COLORS.gray[100] },
  actionBtnDanger: { backgroundColor: '#fef2f2' },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray[700], marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.gray[400], marginTop: 6, textAlign: 'center' },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});
