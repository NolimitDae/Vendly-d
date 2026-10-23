import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { DARK, FONTS } from '../../constants/colors';
import { money, type Extra } from '../../services/addons.service';

type Role = 'VENDOR' | 'CUSTOMER';

const GREEN = '#6ee7c7';
const YELLOW = '#fcd34d';
const RED = '#fca5a5';

/** Short status for a request, worded for whoever is looking. */
export function extraStatus(e: Extra, role: Role): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (e.status === 'APPROVED' || e.status === 'INCLUDED') {
    const p = e.payment?.status;
    if (p === 'FAILED') return { label: 'Payment problem', color: RED, icon: 'alert-circle-outline' };
    if (p === 'REFUNDED') return { label: 'Refunded', color: DARK.accent, icon: 'return-down-back-outline' };
    if (e.status === 'INCLUDED') return { label: 'Included', color: GREEN, icon: 'checkmark-circle-outline' };
    if (p === 'PAID') return { label: 'Paid', color: GREEN, icon: 'checkmark-circle-outline' };
    return { label: 'Approved · charging', color: YELLOW, icon: 'time-outline' };
  }
  switch (e.status) {
    case 'PENDING':
      return { label: role === 'CUSTOMER' ? 'Waiting for you' : 'Waiting for the customer', color: YELLOW, icon: 'hourglass-outline' };
    case 'DECLINED':
      return { label: role === 'CUSTOMER' ? 'You declined' : 'Declined', color: RED, icon: 'close-circle-outline' };
    case 'CANCELLED':
      return { label: 'Withdrawn', color: DARK.muted, icon: 'remove-circle-outline' };
    case 'IN_REVIEW':
      return { label: 'Vendly is reviewing', color: DARK.accent, icon: 'shield-outline' };
    case 'WAIVED':
      return { label: 'Waived by Vendly', color: DARK.muted, icon: 'shield-checkmark-outline' };
    default:
      return { label: e.status, color: DARK.muted, icon: 'ellipse-outline' };
  }
}

/** One add-on or fee on a booking: what it is, what it costs, why it was sent, and where it stands. */
export function ExtraLine({ extra, role, children }: { extra: Extra; role: Role; children?: React.ReactNode }) {
  const st = extraStatus(extra, role);
  const kind = extra.kind === 'FEE' ? 'Fee' : 'Add-on';
  return (
    <View style={s.item}>
      <View style={s.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.name}>{extra.label}</Text>
          <View style={s.meta}>
            <Text style={s.kind}>{kind}</Text>
            <Ionicons name={st.icon} size={14} color={st.color} />
            <Text style={[s.status, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.amount}>{money(role === 'CUSTOMER' ? extra.total : extra.amount)}</Text>
          {role === 'CUSTOMER' && extra.fee_amount > 0 && <Text style={s.small}>incl. {money(extra.fee_amount)} fee</Text>}
        </View>
      </View>
      {!!extra.note && <Text style={s.note}>“{extra.note}”</Text>}
      {extra.status === 'DECLINED' && !!extra.decline_reason && <Text style={s.small}>Reason: {extra.decline_reason}</Text>}
      {extra.status === 'IN_REVIEW' && (
        <Text style={s.small}>
          {role === 'CUSTOMER' ? 'Vendly is checking the contract and the booking, and will let you both know.' : `Sent to Vendly${extra.review_requested_at ? ` on ${format(parseISO(extra.review_requested_at), 'dd MMM')}` : ''}. We’ll let you both know.`}
        </Text>
      )}
      {extra.status === 'WAIVED' && <Text style={s.small}>{role === 'CUSTOMER' ? 'You won’t be charged for this.' : 'Vendly decided this fee isn’t owed.'}</Text>}
      {extra.payment?.status === 'FAILED' && !!extra.payment.last_error && <Text style={[s.small, { color: RED }]}>{extra.payment.last_error}</Text>}
      {children}
    </View>
  );
}

export const extraStyles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  smallBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  bigBtn: { flex: 1, minHeight: 50, borderRadius: 100, borderWidth: 1, borderColor: DARK.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  bigBtnText: { color: DARK.accent, fontSize: 14, fontFamily: FONTS.semibold },
  h2: { color: '#fff', fontSize: 18, fontFamily: FONTS.semibold },
  h3: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold, marginTop: 4 },
  muted: { color: DARK.muted, fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
  label: { color: DARK.text, fontSize: 15, fontFamily: FONTS.medium },
  textarea: { height: undefined, paddingVertical: 12, alignItems: 'flex-start' },
  currency: { color: DARK.muted, fontSize: 18, fontFamily: FONTS.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

const s = StyleSheet.create({
  item: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: DARK.field },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  kind: { color: DARK.muted, fontSize: 12, fontFamily: FONTS.medium, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100, backgroundColor: DARK.field, overflow: 'hidden' },
  status: { fontSize: 12, fontFamily: FONTS.semibold },
  amount: { color: '#fff', fontSize: 15, fontFamily: FONTS.semibold },
  small: { color: DARK.muted, fontSize: 12, lineHeight: 18, fontFamily: FONTS.regular },
  note: { color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: FONTS.regular },
});
