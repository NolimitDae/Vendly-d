import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import { BookingService } from '../../services/booking.service';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

type RouteParams = { listingId: string };
type Nav = NativeStackNavigationProp<any>;

interface ListingDetail {
  id: string;
  title: string;
  description?: string;
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

export default function ListingDetail() {
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const nav = useNavigation<Nav>();
  const { listingId } = route.params;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/marketplace/listings/${listingId}`);
      if (res.data?.success) setListing(res.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleBookNow = () => setModalVisible(true);

  const handleSubmitBooking = async () => {
    if (!listing?.vendor?.id) return;
    setSubmitting(true);
    try {
      const res = await BookingService.createBooking({
        listing_id: listing.id,
        vendor_id: listing.vendor.id,
        scheduled_at: scheduledAt || undefined,
        message: message || undefined,
      });
      if (res.data?.success) {
        setModalVisible(false);
        setScheduledAt('');
        setMessage('');
        Alert.alert('Success', 'Booking request sent!', [
          { text: 'View Bookings', onPress: () => nav.navigate('CustomerBookings') },
          { text: 'OK' },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Listing not found</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Image placeholder */}
        <View style={s.imagePlaceholder}>
          <Ionicons name="image-outline" size={60} color={COLORS.gray[400]} />
        </View>

        <View style={s.content}>
          {/* Title & category */}
          {listing.category && (
            <View style={s.categoryBadge}>
              <Text style={s.categoryText}>{listing.category}</Text>
            </View>
          )}
          <Text style={s.title}>{listing.title}</Text>

          {/* Vendor row */}
          {listing.vendor && (
            <View style={s.vendorRow}>
              <View style={s.vendorAvatar}>
                <Text style={s.vendorInitial}>
                  {listing.vendor.name[0]?.toUpperCase() ?? 'V'}
                </Text>
              </View>
              <Text style={s.vendorName}>{listing.vendor.name}</Text>
            </View>
          )}

          {/* Price */}
          <View style={s.priceRow}>
            <Text style={s.price}>${Number(listing.price).toLocaleString()}</Text>
            {listing.price_unit && (
              <Text style={s.priceUnit}> / {listing.price_unit}</Text>
            )}
          </View>

          {/* Rating */}
          {listing.avg_rating != null && (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text style={s.ratingText}>
                {Number(listing.avg_rating).toFixed(1)}
              </Text>
              {listing.review_count != null && (
                <Text style={s.reviewCount}>({listing.review_count} reviews)</Text>
              )}
            </View>
          )}

          {/* Description */}
          {listing.description && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>About this service</Text>
              <Text style={s.description}>{listing.description}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Book Now button */}
      <View style={s.footer}>
        <TouchableOpacity style={s.bookBtn} onPress={handleBookNow}>
          <Text style={s.bookBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>

      {/* Booking modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Request Booking</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Preferred Date & Time</Text>
            <TextInput
              style={s.input}
              value={scheduledAt}
              onChangeText={setScheduledAt}
              placeholder="e.g. 2024-12-25 or Dec 25, 2024"
              placeholderTextColor={COLORS.gray[400]}
            />

            <Text style={s.label}>Message to Vendor (optional)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Tell the vendor about your event..."
              placeholderTextColor={COLORS.gray[400]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.btnDisabled]}
              onPress={handleSubmitBooking}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={s.submitBtnText}>Request Booking</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: COLORS.gray[500] },
  scrollContent: { paddingBottom: 100 },
  imagePlaceholder: {
    height: 220,
    backgroundColor: COLORS.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, gap: 12 },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryBg,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.gray[900] },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vendorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorInitial: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  vendorName: { fontSize: 14, fontWeight: '600', color: COLORS.gray[700] },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  priceUnit: { fontSize: 14, color: COLORS.gray[500] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 15, fontWeight: '700', color: COLORS.gray[800] },
  reviewCount: { fontSize: 13, color: COLORS.gray[500] },
  section: { gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray[800] },
  description: { fontSize: 14, color: COLORS.gray[600], lineHeight: 22 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[100],
  },
  bookBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  bookBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.gray[900] },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray[600] },
  input: {
    backgroundColor: COLORS.gray[50],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.gray[900],
  },
  textarea: { height: 100 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
