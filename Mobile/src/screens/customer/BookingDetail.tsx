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
  Linking,
  RefreshControl,
} from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { BookingService, Booking, BookingStatus } from '../../services/booking.service';
import { api } from '../../services/api';
import type { RouteProp } from '@react-navigation/native';

type RouteParams = { bookingId: string };

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function statusColor(status: BookingStatus) {
  return COLORS.status[status as keyof typeof COLORS.status] ?? COLORS.status.COMPLETED;
}

export default function BookingDetail() {
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const { bookingId } = route.params;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Review modal state
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await BookingService.getBooking(bookingId);
      if (res.data?.success) setBooking(res.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load booking');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await BookingService.cancelBooking(bookingId);
            load();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message ?? 'Failed to cancel booking');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handlePayNow = async () => {
    setActionLoading(true);
    try {
      const res = await BookingService.createCheckout(bookingId);
      const url = res.data?.url ?? res.data?.data?.url;
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Info', 'Checkout initiated successfully');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to initiate payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!booking) return;
    setReviewSubmitting(true);
    try {
      await api.post('/reviews', {
        booking_id: booking.id,
        vendor_id: booking.vendor?.id,
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewVisible(false);
      setReviewComment('');
      setReviewRating(5);
      Alert.alert('Thank you!', 'Your review has been submitted.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Booking not found</Text>
      </View>
    );
  }

  const sc = statusColor(booking.status);

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Status badge */}
        <View style={s.statusWrap}>
          <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[s.statusText, { color: sc.text }]}>
              {STATUS_LABELS[booking.status]}
            </Text>
          </View>
        </View>

        {/* Detail card */}
        <View style={s.card}>
          <DetailRow
            icon="pricetag-outline"
            label="Service"
            value={booking.listing?.title ?? '—'}
          />
          <DetailRow
            icon="person-outline"
            label="Vendor"
            value={booking.vendor?.name ?? '—'}
          />
          {booking.scheduled_at && (
            <DetailRow
              icon="calendar-outline"
              label="Scheduled"
              value={format(new Date(booking.scheduled_at), 'EEEE, MMMM d yyyy')}
            />
          )}
          {booking.amount != null && (
            <DetailRow
              icon="cash-outline"
              label="Amount"
              value={`$${Number(booking.amount).toLocaleString()}`}
            />
          )}
          <DetailRow
            icon="time-outline"
            label="Created"
            value={format(new Date(booking.created_at), 'MMM d, yyyy')}
          />
        </View>

        {/* Message */}
        {booking.message && (
          <View style={s.messageCard}>
            <Text style={s.messageLabel}>Your Message</Text>
            <Text style={s.messageText}>{booking.message}</Text>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      {booking.status !== 'IN_PROGRESS' && booking.status !== 'CANCELLED' && (
        <View style={s.footer}>
          {booking.status === 'PENDING' && (
            <TouchableOpacity
              style={[s.cancelBtn, actionLoading && s.btnDisabled]}
              onPress={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={COLORS.gray[700]} />
              ) : (
                <Text style={s.cancelBtnText}>Cancel Booking</Text>
              )}
            </TouchableOpacity>
          )}

          {booking.status === 'CONFIRMED' && (
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.payBtn, actionLoading && s.btnDisabled]}
                onPress={handlePayNow}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={s.payBtnText}>Pay Now</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.cancelBtnSmall, actionLoading && s.btnDisabled]}
                onPress={handleCancel}
                disabled={actionLoading}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {booking.status === 'COMPLETED' && (
            <TouchableOpacity
              style={s.reviewBtn}
              onPress={() => setReviewVisible(true)}
            >
              <Ionicons name="star-outline" size={18} color={COLORS.white} />
              <Text style={s.reviewBtnText}>Leave a Review</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Review modal */}
      <Modal
        visible={reviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Leave a Review</Text>
              <TouchableOpacity onPress={() => setReviewVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray[600]} />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Rating</Text>
            <View style={s.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Ionicons
                    name={n <= reviewRating ? 'star' : 'star-outline'}
                    size={32}
                    color="#f59e0b"
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Comment (optional)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Share your experience..."
              placeholderTextColor={COLORS.gray[400]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.submitBtn, reviewSubmitting && s.btnDisabled]}
              onPress={handleSubmitReview}
              disabled={reviewSubmitting}
            >
              {reviewSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={s.submitBtnText}>Submit Review</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon} size={16} color={COLORS.gray[400]} />
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: COLORS.gray[500] },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },
  statusWrap: { alignItems: 'center', paddingVertical: 8 },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[50],
  },
  detailLabel: { fontSize: 13, color: COLORS.gray[500], width: 72 },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.gray[800], flex: 1 },
  messageCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  messageLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray[700] },
  messageText: { fontSize: 14, color: COLORS.gray[600], lineHeight: 20 },
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
  actionRow: { flexDirection: 'row', gap: 12 },
  payBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  payBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    backgroundColor: COLORS.white,
  },
  cancelBtnSmall: {
    flex: 0.45,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[300],
    backgroundColor: COLORS.white,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.gray[700] },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
  },
  reviewBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.6 },
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
  starsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
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
  submitBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
