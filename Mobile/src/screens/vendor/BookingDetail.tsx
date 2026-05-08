import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { COLORS } from '../../constants/colors';
import { api } from '../../services/api';
import type { RouteProp } from '@react-navigation/native-stack';
import type { VendorBookingsStackParams } from '../../navigation/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  status: string;
  created_at: string;
  scheduled_at?: string;
  listing: { title: string };
  customer?: { name: string };
  vendor?: { name: string };
  amount: number;
  message?: string;
}

type Route = RouteProp<VendorBookingsStackParams, 'VendorBookingDetail'>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  CONFIRMED: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  IN_PROGRESS: { bg: '#f3ecfe', text: '#7B2FF7', border: '#9b5ef9' },
  COMPLETED: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  CANCELLED: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VendorBookingDetail() {
  const route = useRoute<Route>();
  const { bookingId } = route.params;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/bookings/${bookingId}`);
      if (res.data?.success) setBooking(res.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load booking details.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAction = async (action: 'confirm' | 'reject' | 'start' | 'complete', label: string) => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await api.patch(`/bookings/${booking.id}/${action}`);
      Alert.alert('Success', `Booking ${label} successfully.`);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? `Failed to ${label} booking.`);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmAction = (action: 'confirm' | 'reject' | 'start' | 'complete', label: string, message: string) => {
    Alert.alert(label, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: () => handleAction(action, label.toLowerCase()) },
    ]);
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
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.gray[300]} />
        <Text style={s.notFoundText}>Booking not found</Text>
      </View>
    );
  }

  const sc = STATUS_COLORS[booking.status] ?? STATUS_COLORS.CANCELLED;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Status banner */}
      <View style={[s.statusBanner, { backgroundColor: sc.bg, borderColor: sc.border }]}>
        <View style={[s.statusDot, { backgroundColor: sc.text }]} />
        <Text style={[s.statusText, { color: sc.text }]}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </Text>
      </View>

      <View style={s.content}>
        {/* Listing */}
        <DetailSection title="Listing">
          <Text style={s.detailValue}>{booking.listing?.title ?? '—'}</Text>
        </DetailSection>

        {/* Customer */}
        <DetailSection title="Customer">
          <View style={s.row}>
            <Ionicons name="person-circle-outline" size={18} color={COLORS.gray[400]} />
            <Text style={s.detailValue}>{booking.customer?.name ?? '—'}</Text>
          </View>
        </DetailSection>

        {/* Date */}
        {booking.scheduled_at && (
          <DetailSection title="Scheduled Date">
            <View style={s.row}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.gray[400]} />
              <Text style={s.detailValue}>
                {format(new Date(booking.scheduled_at), 'EEEE, MMMM d, yyyy')}
              </Text>
            </View>
          </DetailSection>
        )}

        {/* Amount */}
        <DetailSection title="Amount">
          <View style={s.row}>
            <Ionicons name="cash-outline" size={18} color={COLORS.gray[400]} />
            <Text style={[s.detailValue, s.amountText]}>
              ${Number(booking.amount).toLocaleString()}
            </Text>
          </View>
        </DetailSection>

        {/* Message */}
        {booking.message ? (
          <DetailSection title="Customer Message">
            <Text style={s.messageText}>{booking.message}</Text>
          </DetailSection>
        ) : null}

        {/* Booked on */}
        <DetailSection title="Booked On">
          <Text style={s.detailValue}>
            {format(new Date(booking.created_at), 'MMM d, yyyy · h:mm a')}
          </Text>
        </DetailSection>

        {/* Action buttons */}
        {actionLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={s.actions}>
            {booking.status === 'PENDING' && (
              <>
                <TouchableOpacity
                  style={s.btnConfirm}
                  onPress={() => confirmAction('confirm', 'Confirm', 'Confirm this booking?')}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                  <Text style={s.btnText}>Confirm Booking</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.btnReject}
                  onPress={() => confirmAction('reject', 'Reject', 'Reject this booking? This cannot be undone.')}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  <Text style={s.btnRejectText}>Reject</Text>
                </TouchableOpacity>
              </>
            )}

            {booking.status === 'CONFIRMED' && (
              <TouchableOpacity
                style={s.btnProgress}
                onPress={() => confirmAction('start', 'Start', 'Mark this booking as In Progress?')}
              >
                <Ionicons name="play-circle-outline" size={18} color={COLORS.white} />
                <Text style={s.btnText}>Mark In Progress</Text>
              </TouchableOpacity>
            )}

            {booking.status === 'IN_PROGRESS' && (
              <TouchableOpacity
                style={s.btnComplete}
                onPress={() => confirmAction('complete', 'Complete', 'Mark this booking as Completed?')}
              >
                <Ionicons name="checkmark-done-circle-outline" size={18} color={COLORS.white} />
                <Text style={s.btnText}>Mark Complete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notFoundText: { fontSize: 16, color: COLORS.gray[500], marginTop: 12 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 16 },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.gray[500], marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 16, color: COLORS.gray[900], fontWeight: '500' },
  amountText: { fontWeight: '700', color: COLORS.primary, fontSize: 18 },
  messageText: { fontSize: 15, color: COLORS.gray[700], lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { marginTop: 8, gap: 10 },
  btnConfirm: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnProgress: {
    backgroundColor: '#7B2FF7',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnComplete: {
    backgroundColor: '#15803d',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnReject: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  btnRejectText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
});
