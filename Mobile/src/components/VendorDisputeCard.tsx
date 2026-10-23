import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Card, GradientButton, ui } from './brand';
import { DARK, FONTS } from '../constants/colors';
import { BookingService, type Booking } from '../services/booking.service';
import { apiMessage } from '../screens/auth/SignIn';
import { haptic } from '../utils/haptics';
import DisputeDetails from './DisputeDetails';

const MIN = 10;
const MAX = 2000;

/** What the customer reported, that the payout is held, and the vendor's reply for Vendly. */
export default function VendorDisputeCard({ booking, onChanged }: { booking: Booking; onChanged?: () => void }) {
  const [reply, setReply] = useState(booking.dispute_vendor_reply ?? '');
  const [editing, setEditing] = useState(!booking.dispute_vendor_reply);
  const [saving, setSaving] = useState(false);
  if (!booking.dispute_opened_at) return null;
  const open = !booking.dispute_resolved_at;

  const send = async () => {
    const text = reply.trim();
    if (text.length < MIN) return Alert.alert('Your side', `Write at least ${MIN} characters.`);
    setSaving(true);
    try {
      await BookingService.replyToDispute(booking.id, text);
      haptic.success();
      setEditing(false);
      onChanged?.();
    } catch (e) {
      Alert.alert('Couldn’t send your reply', apiMessage(e, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={[{ gap: 10 }, open && s.openCard]}>
      <View style={s.row}>
        <Ionicons name={open ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={22} color={open ? '#fcd34d' : '#6ee7c7'} />
        <Text style={s.h2}>{open ? 'The customer reported a problem' : 'Problem resolved'}</Text>
      </View>
      <Text style={s.muted}>Reported {format(parseISO(booking.dispute_opened_at), 'MMM d, yyyy h:mm a')}</Text>
      {!!booking.dispute_reason && <Text style={s.quote}>“{booking.dispute_reason}”</Text>}
      <DisputeDetails d={booking} />
      {open ? (
        <Text style={s.body}>Your payment for this booking is held until Vendly reviews it. Give your side below; proof photos you’ve uploaded are seen by Vendly too.</Text>
      ) : (
        !!booking.dispute_resolution && <Text style={s.body}>Vendly’s decision: {booking.dispute_resolution.replace(/ by admin [^:]+:/, ':')}</Text>
      )}

      {open && editing ? (
        <View style={{ gap: 8 }}>
          <View style={[ui.field, { height: undefined, paddingVertical: 12, alignItems: 'flex-start' }]}>
            <TextInput
              style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]}
              placeholder="What happened, and anything Vendly should know"
              placeholderTextColor={DARK.muted}
              value={reply}
              onChangeText={(t) => setReply(t.slice(0, MAX))}
              multiline
              accessibilityLabel="Your side of the dispute"
            />
          </View>
          <GradientButton title="Send to Vendly" onPress={send} loading={saving} disabled={reply.trim().length < MIN} />
        </View>
      ) : (
        !!booking.dispute_vendor_reply && (
          <View style={{ gap: 4 }}>
            <Text style={s.label}>
              Your reply{booking.dispute_vendor_replied_at ? ` · ${format(parseISO(booking.dispute_vendor_replied_at), 'MMM d, h:mm a')}` : ''}
            </Text>
            <Text style={s.body}>{booking.dispute_vendor_reply}</Text>
            {open && (
              <Pressable onPress={() => setEditing(true)} hitSlop={10} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                <Text style={s.link}>Edit reply</Text>
              </Pressable>
            )}
          </View>
        )
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  openCard: { borderWidth: 1, borderColor: 'rgba(252,211,77,0.45)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { color: '#fff', fontSize: 16, fontFamily: FONTS.semibold, flex: 1 },
  muted: { color: DARK.muted, fontSize: 13, fontFamily: FONTS.regular },
  quote: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium, lineHeight: 20 },
  body: { color: DARK.text, fontSize: 14, fontFamily: FONTS.regular, lineHeight: 20 },
  label: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.semibold },
  link: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.medium },
});
