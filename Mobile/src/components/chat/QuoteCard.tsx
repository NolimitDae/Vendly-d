import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { BrandGradient } from '../brand';
import { DARK, FONTS } from '../../constants/colors';
import type { Quote } from '../../services/chat.service';

const STATUS: Record<string, { label: string; color: string }> = {
  ACCEPTED: { label: 'Accepted · booking requested', color: '#5BD69A' },
  DECLINED: { label: 'Declined', color: '#FF8A8A' },
  WITHDRAWN: { label: 'Withdrawn by the vendor', color: DARK.muted },
  EXPIRED: { label: 'Expired', color: DARK.muted },
};

/** A vendor's custom price, shown in the chat. The customer accepts (starts a booking) or declines. */
export default function QuoteCard({
  quote,
  role,
  busy,
  onAccept,
  onDecline,
  onWithdraw,
  onOpen,
}: {
  quote: Quote;
  role: 'customer' | 'vendor' | 'other';
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  /** tapping the card: the booking it became, or (still open) the booking flow at this price */
  onOpen?: () => void;
}) {
  const st = STATUS[quote.status];
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && onOpen ? { opacity: 0.85 } : null]}
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={onOpen ? (quote.booking_id ? `View the booking for ${quote.title}` : `Book ${quote.title}`) : undefined}
    >
      <View style={s.head}>
        <Ionicons name="pricetags-outline" size={16} color={DARK.accent} />
        <Text style={s.kicker}>Custom quote</Text>
      </View>
      <View style={s.row}>
        {quote.listing?.image ? <Image source={{ uri: quote.listing.image }} style={s.thumb} /> : <View style={[s.thumb, s.center]}><Ionicons name="cube-outline" size={20} color={DARK.muted} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>{quote.title}</Text>
          {!!quote.listing && <Text style={s.muted} numberOfLines={1}>{quote.listing.title}</Text>}
        </View>
        <Text style={s.amount}>${quote.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      </View>
      {!!quote.description && <Text style={s.body}>{quote.description}</Text>}

      {st ? (
        <View style={s.statusRow}>
          <Text style={[s.status, { color: st.color }]}>{st.label}</Text>
          {!!quote.booking_id && !!onOpen && (
            <View style={s.viewRow}>
              <Text style={s.viewText}>View booking</Text>
              <Ionicons name="chevron-forward" size={14} color={DARK.accent} />
            </View>
          )}
        </View>
      ) : (
        <>
          <Text style={s.muted}>Valid until {format(parseISO(quote.expires_at), 'EEE d MMM')}</Text>
          {role === 'customer' && (
            <View style={s.actions}>
              <Pressable onPress={onDecline} style={s.decline} disabled={busy} accessibilityRole="button">
                <Text style={s.declineText}>Decline</Text>
              </Pressable>
              <Pressable onPress={onAccept} disabled={busy} accessibilityRole="button" style={{ flex: 1 }}>
                <BrandGradient style={s.accept}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.acceptText}>Accept & book</Text>}</BrandGradient>
              </Pressable>
            </View>
          )}
          {role === 'vendor' && (
            <Pressable onPress={onWithdraw} disabled={busy} style={s.decline} accessibilityRole="button">
              <Text style={s.declineText}>Withdraw quote</Text>
            </Pressable>
          )}
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { width: 280, backgroundColor: DARK.card, borderRadius: 20, borderWidth: 1, borderColor: DARK.border, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: DARK.field },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  amount: { color: '#fff', fontSize: 18, fontFamily: FONTS.bold },
  body: { color: '#E9DDEB', fontSize: 14, lineHeight: 20, fontFamily: FONTS.regular },
  muted: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.regular },
  status: { fontSize: 13, fontFamily: FONTS.semibold, flexShrink: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  viewRow: { flexDirection: 'row', alignItems: 'center' },
  viewText: { color: DARK.accent, fontSize: 12, fontFamily: FONTS.semibold },
  actions: { flexDirection: 'row', gap: 8 },
  decline: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  declineText: { color: '#fff', fontSize: 14, fontFamily: FONTS.medium },
  accept: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#fff', fontSize: 14, fontFamily: FONTS.semibold },
});
