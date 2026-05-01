import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { MarketplaceService, BookingService, Listing } from '../../services/marketplace.service';
import { EventsService, Event } from '../../services/events.service';

const DEBOUNCE_MS = 400;

export default function Discover() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [addModal, setAddModal] = useState<{ listing: Listing } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories and active events on mount
  useEffect(() => {
    MarketplaceService.getCategories().then((r) => {
      if (r.data?.success) setCategories(r.data.data);
    });
    EventsService.list({ limit: 50 }).then((r) => {
      if (r.data?.success) {
        const active = r.data.data.filter(
          (e) => e.status !== 'CANCELLED' && e.status !== 'COMPLETED',
        );
        setActiveEvents(active);
        if (active.length === 1) setSelectedEvent(active[0]);
      }
    });
  }, []);

  const search = useCallback(async (q: string, catId: string, pg: number, append = false) => {
    setLoading(true);
    try {
      const res = await MarketplaceService.search({
        q: q || undefined,
        category_id: catId || undefined,
        page: pg,
        limit: 15,
      });
      if (res.data?.success) {
        const data = res.data.data;
        setListings(append ? (prev) => [...prev, ...data] : data);
        setHasMore(pg < res.data.meta.last_page);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      search(query, categoryId, 1, false);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, categoryId, search]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    search(query, categoryId, next, true);
  };

  const handleAddToEvent = async (listing: Listing) => {
    if (!selectedEvent) {
      if (activeEvents.length === 0) {
        Alert.alert('No Active Events', 'Create an event first before adding vendors.');
        return;
      }
      setAddModal({ listing });
      return;
    }
    confirmAdd(listing, selectedEvent);
  };

  const confirmAdd = (listing: Listing, event: Event) => {
    Alert.alert(
      'Add Vendor to Event',
      `Add "${listing.title}" by ${listing.vendor.name} to "${event.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book & Add',
          onPress: () => bookAndLink(listing, event),
        },
      ],
    );
  };

  const bookAndLink = async (listing: Listing, event: Event) => {
    setAddingId(listing.id);
    try {
      // 1. Create a booking (event planner acts as customer)
      const bookRes = await BookingService.create({
        listing_id: listing.id,
        vendor_id: listing.vendor.id,
      });
      if (!bookRes.data?.success) {
        Alert.alert('Error', 'Failed to create booking');
        return;
      }
      const bookingId = bookRes.data.data.id;

      // 2. Link booking to event
      await EventsService.linkBooking(event.id, bookingId);
      Alert.alert('Success', `${listing.vendor.name} added to "${event.name}"`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to add vendor');
    } finally {
      setAddingId(null);
    }
  };

  const renderItem = ({ item }: { item: Listing }) => (
    <ListingCard
      listing={item}
      selectedEvent={selectedEvent}
      adding={addingId === item.id}
      onAdd={() => handleAddToEvent(item)}
    />
  );

  return (
    <View style={s.root}>
      {/* Event selector */}
      <TouchableOpacity style={s.eventSelector} onPress={() => activeEvents.length > 1 && setEventModalOpen(true)}>
        <Ionicons name="calendar" size={16} color={COLORS.primary} />
        <Text style={s.eventSelectorText} numberOfLines={1}>
          {selectedEvent ? selectedEvent.name : 'Select an event to add vendors'}
        </Text>
        {activeEvents.length > 1 && (
          <Ionicons name="chevron-down" size={14} color={COLORS.primary} />
        )}
      </TouchableOpacity>

      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={COLORS.gray[400]} />
          <TextInput
            style={s.searchInput}
            placeholder="Search vendors & services..."
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category pills */}
      {categories.length > 0 && (
        <FlatList
          horizontal
          data={[{ id: '', name: 'All' }, ...categories]}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catList}
          renderItem={({ item: cat }) => (
            <TouchableOpacity
              style={[s.catPill, categoryId === cat.id && s.catPillActive]}
              onPress={() => setCategoryId(cat.id)}
            >
              <Text style={[s.catText, categoryId === cat.id && s.catTextActive]}>{cat.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Listings */}
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        contentContainerStyle={[s.list, listings.length === 0 && { flex: 1 }]}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loading ? <ActivityIndicator color={COLORS.primary} style={{ margin: 16 }} /> : null}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Ionicons name="search-outline" size={48} color={COLORS.gray[300]} />
              <Text style={s.emptyText}>No vendors found</Text>
            </View>
          ) : null
        }
      />

      {/* Event picker modal */}
      <Modal visible={eventModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEventModalOpen(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Event</Text>
            <TouchableOpacity onPress={() => setEventModalOpen(false)}>
              <Ionicons name="close" size={22} color={COLORS.gray[700]} />
            </TouchableOpacity>
          </View>
          {activeEvents.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[s.modalItem, selectedEvent?.id === e.id && s.modalItemActive]}
              onPress={() => { setSelectedEvent(e); setEventModalOpen(false); }}
            >
              <Text style={[s.modalItemText, selectedEvent?.id === e.id && { color: COLORS.primary }]}>{e.name}</Text>
              {selectedEvent?.id === e.id && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Booking confirmation modal (event selection) */}
      <Modal visible={!!addModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddModal(null)}>
        {addModal && (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add to Which Event?</Text>
              <TouchableOpacity onPress={() => setAddModal(null)}>
                <Ionicons name="close" size={22} color={COLORS.gray[700]} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>Adding: {addModal.listing.title}</Text>
            {activeEvents.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={s.modalItem}
                onPress={() => {
                  setAddModal(null);
                  confirmAdd(addModal.listing, e);
                }}
              >
                <Text style={s.modalItemText}>{e.name}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.gray[400]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Modal>
    </View>
  );
}

function ListingCard({
  listing,
  selectedEvent,
  adding,
  onAdd,
}: {
  listing: Listing;
  selectedEvent: Event | null;
  adding: boolean;
  onAdd: () => void;
}) {
  const hasImage = listing.images && listing.images.length > 0;
  return (
    <View style={s.card}>
      {hasImage ? (
        <Image source={{ uri: listing.images[0] }} style={s.cardImg} />
      ) : (
        <View style={[s.cardImg, s.cardImgPlaceholder]}>
          <Ionicons name="image-outline" size={28} color={COLORS.gray[300]} />
        </View>
      )}
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{listing.title}</Text>
        <Text style={s.cardVendor}>{listing.vendor.name}</Text>
        {listing.category && (
          <View style={s.catTag}>
            <Text style={s.catTagText}>{listing.category.name}</Text>
          </View>
        )}
        <View style={s.cardFooter}>
          <Text style={s.cardPrice}>
            ${Number(listing.price).toLocaleString()}
            <Text style={s.cardUnit}> / {listing.price_unit}</Text>
          </Text>
          {listing.avg_rating != null && (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={12} color="#f59e0b" />
              <Text style={s.ratingText}>{listing.avg_rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[s.addBtn, adding && s.addBtnDisabled]}
          onPress={onAdd}
          disabled={adding}
        >
          {adding ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={16} color={COLORS.white} />
              <Text style={s.addBtnText}>
                {selectedEvent ? `Add to ${selectedEvent.name.slice(0, 20)}` : 'Add to Event'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  eventSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryLight + '30',
  },
  eventSelectorText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.primary },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: COLORS.gray[900] },
  catList: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  catPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray[200] },
  catPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  catTextActive: { color: COLORS.white },
  list: { paddingHorizontal: 16, paddingBottom: 80 },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardImg: { width: 100, height: '100%', minHeight: 120 },
  cardImgPlaceholder: { backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray[900], lineHeight: 19 },
  cardVendor: { fontSize: 12, color: COLORS.gray[500], marginTop: 2 },
  catTag: { alignSelf: 'flex-start', backgroundColor: COLORS.primaryBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  catTagText: { fontSize: 10, fontWeight: '600', color: COLORS.primary },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardPrice: { fontSize: 14, fontWeight: '800', color: COLORS.gray[900] },
  cardUnit: { fontSize: 11, fontWeight: '400', color: COLORS.gray[400] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 12, fontWeight: '600', color: COLORS.gray[700] },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.gray[500] },
  modal: { flex: 1, backgroundColor: COLORS.white, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray[900] },
  modalSub: { fontSize: 13, color: COLORS.gray[500], marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100] },
  modalItemActive: { backgroundColor: COLORS.primaryBg, marginHorizontal: -20, paddingHorizontal: 20, borderRadius: 10 },
  modalItemText: { fontSize: 15, fontWeight: '600', color: COLORS.gray[800] },
});
