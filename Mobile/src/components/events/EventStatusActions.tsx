import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { GradientButton } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import { EventsService, type EventBooking, type EventStatus } from '../../services/events.service';
import { apiMessage } from '../../screens/auth/SignIn';

type Action = 'IN_PROGRESS' | 'COMPLETED' | 'CANCEL';

/** Mirrors the API's allowed moves: PLANNING/CONFIRMED -> IN_PROGRESS -> COMPLETED, cancel before completion. */
export function eventActionsFor(status: EventStatus): Action[] {
  if (status === 'PLANNING' || status === 'CONFIRMED') return ['IN_PROGRESS', 'CANCEL'];
  if (status === 'IN_PROGRESS') return ['COMPLETED', 'CANCEL'];
  return [];
}

/** Details can be edited until the event is completed or cancelled. */
export const canEditEvent = (status: EventStatus) => status !== 'COMPLETED' && status !== 'CANCELLED';

/** A cancelled event is read-only: no new tasks, budget lines, run-of-show items, files or invites. */
export const isEventReadOnly = (status: EventStatus) => status === 'CANCELLED';

export const CANCEL_EVENT_MESSAGE =
  "The event will be marked cancelled. After that its details can't be edited and it can't be reopened.\n\nYour vendor bookings are not cancelled with it: they stay as they are and vendors are not told. Cancel each booking you no longer need from its own booking screen.";

/** Edit / Mark in progress / Mark completed / Cancel event, for whatever the current status allows. */
export default function EventStatusActions({
  eventId,
  status,
  onEdit,
  onChanged,
}: {
  eventId: string;
  status: EventStatus;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const actions = eventActionsFor(status);
  if (!canEditEvent(status) && actions.length === 0) return null;

  const run = async (action: Action) => {
    setBusy(action);
    try {
      if (action === 'CANCEL') await EventsService.cancel(eventId);
      else await EventsService.update(eventId, { status: action });
      onChanged();
    } catch (err) {
      Alert.alert(action === 'CANCEL' ? 'Could not cancel the event' : 'Could not update the event', apiMessage(err, 'Try again in a moment.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmComplete = () =>
    Alert.alert('Mark event completed?', "It can't be moved back to planning or in progress afterwards.", [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Mark completed', onPress: () => run('COMPLETED') },
    ]);

  const confirmCancel = () =>
    Alert.alert('Cancel this event?', CANCEL_EVENT_MESSAGE, [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Cancel event', style: 'destructive', onPress: () => run('CANCEL') },
    ]);

  return (
    <View style={s.card}>
      <Text style={s.title}>Event status</Text>
      {actions.includes('IN_PROGRESS') && (
        <GradientButton title="Mark in progress" onPress={() => run('IN_PROGRESS')} loading={busy === 'IN_PROGRESS'} disabled={busy !== null && busy !== 'IN_PROGRESS'} />
      )}
      {actions.includes('COMPLETED') && (
        <GradientButton title="Mark completed" onPress={confirmComplete} loading={busy === 'COMPLETED'} disabled={busy !== null && busy !== 'COMPLETED'} />
      )}
      <View style={s.row}>
        {canEditEvent(status) && (
          <Pressable
            onPress={onEdit}
            disabled={busy !== null}
            style={({ pressed }) => [s.outline, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Edit event details"
          >
            <Ionicons name="create-outline" size={18} color={DARK.accent} />
            <Text style={s.outlineText}>Edit details</Text>
          </Pressable>
        )}
        {actions.includes('CANCEL') && (
          <Pressable
            onPress={confirmCancel}
            disabled={busy !== null}
            style={({ pressed }) => [s.outline, s.danger, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel event"
            accessibilityHint="Asks you to confirm. Vendor bookings are not cancelled."
          >
            {busy === 'CANCEL' ? <ActivityIndicator color="#fca5a5" /> : <Ionicons name="close-circle-outline" size={18} color="#fca5a5" />}
            <Text style={[s.outlineText, { color: '#fca5a5' }]}>Cancel event</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** "Completed on <date>" (from `completed_at`) plus a way into each finished booking, where the review prompt lives. */
export function EventCompletedBanner({
  completedAt,
  bookings,
  onOpenBooking,
  onRateVendors,
  toRate = 0,
}: {
  completedAt?: string;
  bookings: EventBooking[];
  onOpenBooking: (bookingId: string) => void;
  /** with it, one "Rate your vendors" button opens the event's rating screen instead of a row per booking */
  onRateVendors?: () => void;
  /** completed bookings not rated yet (the badge) */
  toRate?: number;
}) {
  const finished = bookings.filter((eb) => eb.booking.status === 'COMPLETED');
  return (
    <View style={[s.card, s.done]} accessibilityRole="summary">
      <View style={s.doneHead}>
        <Ionicons name="checkmark-circle" size={26} color="#6ee7c7" />
        <Text style={s.doneTitle}>{completedAt ? `Completed on ${format(new Date(completedAt), 'MMM d, yyyy')}` : 'Completed'}</Text>
      </View>
      {finished.length > 0 && onRateVendors ? (
        <>
          <Text style={s.doneBody}>How did your vendors do? Rate them all in one place.</Text>
          <Pressable
            onPress={onRateVendors}
            style={({ pressed }) => [s.bookingRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={toRate > 0 ? `Rate your vendors, ${toRate} to rate` : 'Rate your vendors'}
          >
            <Ionicons name="star-outline" size={18} color="#fcd34d" />
            <Text style={s.bookingText} numberOfLines={1}>Rate your vendors</Text>
            {toRate > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countText}>{toRate}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
          </Pressable>
        </>
      ) : finished.length > 0 ? (
        <>
          <Text style={s.doneBody}>How did your vendors do? Open a booking to leave a review.</Text>
          {finished.map((eb) => (
            <Pressable
              key={eb.id}
              onPress={() => onOpenBooking(eb.booking.id)}
              style={({ pressed }) => [s.bookingRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Review ${eb.booking.vendor.name}`}
            >
              <Ionicons name="star-outline" size={18} color="#fcd34d" />
              <Text style={s.bookingText} numberOfLines={1}>{eb.booking.vendor.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={DARK.muted} />
            </Pressable>
          ))}
        </>
      ) : bookings.length > 0 ? (
        <Text style={s.doneBody}>You can review each vendor from their booking once that booking is completed.</Text>
      ) : null}
    </View>
  );
}

/** Shown on a cancelled event: everything stays readable, nothing can be added or changed. */
export function EventCancelledBanner({ cancelledAt }: { cancelledAt?: string | null }) {
  return (
    <View style={[s.card, s.cancelled]} accessibilityRole="summary">
      <View style={s.doneHead}>
        <Ionicons name="close-circle" size={26} color="#fca5a5" />
        <Text style={s.doneTitle}>{cancelledAt ? `Cancelled on ${format(new Date(cancelledAt), 'MMM d, yyyy')}` : 'Cancelled'}</Text>
      </View>
      <Text style={s.doneBody}>You can still see the tasks, budget, run of show and files, but nothing can be added or changed.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cancelled: { borderWidth: 1, borderColor: '#7f1d1d' },
  card: { backgroundColor: DARK.card, borderRadius: 16, padding: 16, gap: 12 },
  title: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold },
  row: { flexDirection: 'row', gap: 10 },
  outline: { flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  outlineText: { color: DARK.accent, fontSize: 15, fontFamily: FONTS.medium },
  danger: { borderColor: '#7f1d1d' },
  done: { borderWidth: 1, borderColor: '#14532d' },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doneTitle: { flex: 1, color: '#fff', fontSize: 17, fontFamily: FONTS.semibold },
  doneBody: { color: DARK.muted, fontSize: 14, lineHeight: 21, fontFamily: FONTS.regular },
  bookingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: DARK.field },
  bookingText: { flex: 1, color: '#fff', fontSize: 15, fontFamily: FONTS.medium },
  countBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#fcd34d', alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#1f2937', fontSize: 12, fontFamily: FONTS.bold },
});
